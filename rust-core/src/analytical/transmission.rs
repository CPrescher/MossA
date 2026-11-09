//! Chain rule through exp(-optical depth), the fixed-source convolution and
//! the actual interpolation used by the forward model (including PCHIP slopes).
use super::*;

/// Partials of each PCHIP slope with respect to its two adjacent secants.
/// Endpoint pairs have the same reversed ordering as `pchip_slopes`.
fn slope_weights(y: &[f64]) -> Vec<[f64; 2]> {
    let h = 0.01;
    let d: Vec<_> = y.windows(2).map(|w| (w[1] - w[0]) / h).collect();
    let n = y.len();
    let mut weights = vec![[0.; 2]; n];
    for i in 1..n - 1 {
        let (a, b) = (d[i - 1], d[i]);
        if a * b > 0. {
            weights[i] = [2. * (b / (a + b)).powi(2), 2. * (a / (a + b)).powi(2)];
        }
    }
    let end = |a: f64, b: f64| {
        let v = (3. * a - b) / 2.;
        if v * a <= 0. {
            [0., 0.]
        } else if a * b < 0. && v.abs() > 3. * a.abs() {
            [3., 0.]
        } else {
            [1.5, -0.5]
        }
    };
    weights[0] = end(d[0], d[1]);
    weights[n - 1] = end(d[n - 2], d[n - 3]);
    weights
}
#[cfg(test)]
fn slope_tangent(y: &[f64], weights: &[[f64; 2]]) -> Vec<f64> {
    let d: Vec<_> = y.windows(2).map(|w| (w[1] - w[0]) / 0.01).collect();
    let n = y.len();
    let mut s = vec![0.; n];
    for i in 1..n - 1 {
        s[i] = weights[i][0] * d[i - 1] + weights[i][1] * d[i];
    }
    s[0] = weights[0][0] * d[0] + weights[0][1] * d[1];
    s[n - 1] = weights[n - 1][0] * d[n - 2] + weights[n - 1][1] * d[n - 3];
    s
}
// PCHIP is only piecewise differentiable. If the existing finite-difference
// step straddles a limiter switch used by an observation, keep the numerical
// column for that coordinate. All other columns retain the exact chain rule.
fn branch(a: f64, b: f64, endpoint: bool) -> u8 {
    if !endpoint {
        return u8::from(a * b > 0.);
    }
    let v = (3. * a - b) / 2.;
    if v * a <= 0. {
        0
    } else if a * b < 0. && v.abs() > 3. * a.abs() {
        2
    } else {
        1
    }
}
fn crosses_limiter(
    grid: &[f64],
    derivative: &[f64],
    used: &[usize],
    plus: f64,
    minus: f64,
) -> bool {
    used.iter().any(|&i| {
        let (a, b, da, db, endpoint) = if i == 0 {
            (
                grid[1] - grid[0],
                grid[2] - grid[1],
                derivative[1] - derivative[0],
                derivative[2] - derivative[1],
                true,
            )
        } else if i == grid.len() - 1 {
            (
                grid[i] - grid[i - 1],
                grid[i - 1] - grid[i - 2],
                derivative[i] - derivative[i - 1],
                derivative[i - 1] - derivative[i - 2],
                true,
            )
        } else {
            (
                grid[i] - grid[i - 1],
                grid[i + 1] - grid[i],
                derivative[i] - derivative[i - 1],
                derivative[i + 1] - derivative[i],
                false,
            )
        };
        branch((a + plus * da) / 0.01, (b + plus * db) / 0.01, endpoint)
            != branch((a - minus * da) / 0.01, (b - minus * db) / 0.01, endpoint)
    })
}
/// The local derivative of interpolation is a short linear stencil. Building
/// it once avoids a 6,001-element slope tangent per optimizer coordinate.
struct Sample {
    start: usize,
    len: usize,
    weights: [f64; 6],
}
impl Sample {
    fn value(&self, grid: &[f64]) -> f64 {
        (0..self.len)
            .map(|j| grid[self.start + j] * self.weights[j])
            .sum()
    }
}
fn interpolation(grid: &[f64], xs: &[f64], gaussian: bool) -> (Vec<Sample>, Vec<usize>) {
    let slopes = if gaussian {
        vec![]
    } else {
        slope_weights(grid)
    };
    let mut used = Vec::new();
    let samples = xs
        .iter()
        .map(|&x| {
            let u = ((x + 30.) / 0.01).clamp(0., (grid.len() - 1) as f64);
            if gaussian {
                let start = (u.floor() as usize).saturating_sub(2).min(grid.len() - 6);
                let t = u - start as f64;
                let mut weights = [0.; 6];
                for (j, weight) in weights.iter_mut().enumerate() {
                    *weight = (0..6)
                        .filter(|&k| k != j)
                        .fold(1., |w, k| w * (t - k as f64) / (j as f64 - k as f64));
                }
                Sample {
                    start,
                    len: 6,
                    weights,
                }
            } else {
                let i = (u.floor() as usize).min(grid.len() - 2);
                let t = u - i as f64;
                let start = i.saturating_sub(1);
                let mut weights = [0.; 6];
                weights[i - start] = 2. * t.powi(3) - 3. * t * t + 1.;
                weights[i + 1 - start] = -2. * t.powi(3) + 3. * t * t;
                for (s, factor) in [(i, t.powi(3) - 2. * t * t + t), (i + 1, t.powi(3) - t * t)] {
                    if factor == 0. {
                        continue;
                    }
                    used.push(s);
                    let [a, b] = slopes[s];
                    let (first, terms) = if s == 0 {
                        (0, [-a, a - b, b])
                    } else if s == grid.len() - 1 {
                        (s - 2, [-b, b - a, a])
                    } else {
                        (s - 1, [-a, a - b, b])
                    };
                    for (j, term) in terms.iter().enumerate() {
                        weights[first + j - start] += factor * term;
                    }
                }
                Sample {
                    start,
                    len: 4.min(grid.len() - start),
                    weights,
                }
            }
        })
        .collect();
    used.sort_unstable();
    used.dedup();
    (samples, used)
}

impl Prepared {
    pub(super) fn transmission_derivative(
        &self,
        p: &Project,
        sites: &[Lines<'_>],
        background: &[(i32, (usize, f64))],
        maps: &[distribution::Mapping],
        x: &[f64],
    ) -> Option<DMatrix<f64>> {
        let n = x.len();
        let gaussian = p.source_gaussians.is_some();
        let snapshot = || {
            self.transmission_snapshot
                .lock()
                .unwrap()
                .as_ref()
                .filter(|s| s.x == x)
                .cloned()
        };
        let cached = snapshot().or_else(|| {
            // Direct Jacobian callers need the same forward grid as solver
            // callers. Evaluating once also populates the exact-coordinate cache.
            self.model_curves(x, false);
            snapshot()
        })?;
        let source = self.source_fft.as_ref().or(cached.source.as_ref())?;
        let grid = &cached.grid;
        let kernel_jac = self.source_derivatives(p, maps, n);
        let optical = if let Some(joint) = &cached.optical_jac {
            let mut j = joint.jac.clone();
            for row in 0..6001 {
                if cancellation_requested() {
                    return None;
                }
                let trans = (-cached.depth[row]).exp();
                for k in 0..n {
                    j[(row, k)] = -trans * j[(row, k)];
                }
            }
            j
        } else {
            let mut j = DMatrix::<f64>::zeros(6001, n);
            let mut gradient = vec![0.; n];
            for row in 0..6001 {
                if cancellation_requested() {
                    return None;
                }
                let trans = (-cached.depth[row]).exp();
                gradient.fill(0.);
                for site in sites {
                    site.accumulate(-30. + row as f64 * 0.01, &mut gradient);
                }
                for k in 0..n {
                    j[(row, k)] = -trans * gradient[k];
                }
            }
            j
        };
        let sampled = &cached.sampled;
        let norm = if self.source_calibration {
            sampled.iter().copied().fold(f64::NEG_INFINITY, f64::max)
        } else {
            1.
        };
        let maximum = |values: &[f64]| {
            values
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.total_cmp(b.1))
                .map(|(i, _)| i)
                .unwrap()
        };
        let imax = maximum(sampled);
        let (samples, used_slopes) = interpolation(&grid, &p.spectrum.x, gaussian);
        let column_at = |k: usize| {
            if cancellation_requested() {
                return vec![0.; p.spectrum.x.len()];
            }
            // Release each thread's workspace before a limiter fallback calls
            // the forward evaluator. Background-only roots need no FFT.
            let source_active = kernel_jac
                .as_ref()
                .is_some_and(|j| j.column(k).iter().any(|&v| v != 0.));
            let optical_active = optical.column(k).iter().any(|&v| v != 0.);
            let column = if !optical_active && !source_active {
                Some(vec![0.; p.spectrum.x.len()])
            } else {
                TRANSMISSION_WORKSPACE.with(|workspace| {
                    let mut workspace = workspace.borrow_mut();
                    let real = source.len() == TRANSMISSION_FFT_LEN / 2 + 1;
                    if optical_active {
                        workspace.forward_signal(optical.column(k).iter().copied(), real);
                        for (v, s) in workspace.spectrum_mut(real).iter_mut().zip(source) {
                            *v *= s;
                        }
                    }
                    if source_active {
                        let absorber_derivative =
                            optical_active.then(|| workspace.spectrum(real).to_vec());
                        workspace.forward_signal(
                            kernel_jac.as_ref().unwrap().column(k).iter().copied(),
                            real,
                        );
                        for (i, (v, z)) in workspace
                            .spectrum_mut(real)
                            .iter_mut()
                            .zip(cached.absorber_fft.as_ref().unwrap())
                            .enumerate()
                        {
                            let ds = *v * z;
                            *v = absorber_derivative
                                .as_ref()
                                .map_or(Complex::default(), |a| a[i])
                                + ds;
                        }
                    }
                    let signal = workspace.inverse_signal(real);
                    let derivative: Vec<_> = (0..6001)
                        .map(|i| signal[i + 3000] / TRANSMISSION_FFT_LEN as f64 / 100.)
                        .collect();
                    let h = 6e-6 * x[k].abs().max(1.);
                    if !gaussian
                        && crosses_limiter(
                            &grid,
                            &derivative,
                            &used_slopes,
                            (x[k] + h).min(self.upper[k]) - x[k],
                            x[k] - (x[k] - h).max(self.lower[k]),
                        )
                    {
                        return None;
                    }
                    let dt: Vec<_> = samples.iter().map(|s| s.value(&derivative)).collect();
                    if self.source_calibration {
                        let plus = (x[k] + h).min(self.upper[k]) - x[k];
                        let minus = x[k] - (x[k] - h).max(self.lower[k]);
                        let high: Vec<_> =
                            sampled.iter().zip(&dt).map(|(v, d)| v + plus * d).collect();
                        let low: Vec<_> = sampled
                            .iter()
                            .zip(&dt)
                            .map(|(v, d)| v - minus * d)
                            .collect();
                        if maximum(&high) != imax || maximum(&low) != imax {
                            return None;
                        }
                    }
                    Some(
                        dt.iter()
                            .enumerate()
                            .map(|(i, &v)| {
                                p.background[0].value
                                    * (v / norm
                                        - if self.source_calibration {
                                            sampled[i] * dt[imax] / (norm * norm)
                                        } else {
                                            0.
                                        })
                            })
                            .collect::<Vec<_>>(),
                    )
                })
            };
            let Some(mut column) = column else {
                return self.derivative_column(x, k);
            };
            for (row, (&v, &observed)) in p.spectrum.x.iter().zip(&p.spectrum.y).enumerate() {
                for &(degree, (root, factor)) in background {
                    if root == k {
                        column[row] += factor
                            * if degree == 0 {
                                sampled[row] / norm
                            } else {
                                v.powi(degree)
                            };
                    }
                }
                if p.weighting == "counts" {
                    column[row] /= observed.sqrt();
                }
            }
            column
        };
        #[cfg(not(target_arch = "wasm32"))]
        let parallel = native::derivatives::columns_with(self, n, column_at);
        #[cfg(target_arch = "wasm32")]
        let parallel = None;
        let j = parallel.unwrap_or_else(|| {
            let mut matrix = DMatrix::<f64>::zeros(p.spectrum.x.len(), n);
            for k in 0..n {
                matrix.column_mut(k).copy_from_slice(&column_at(k));
            }
            matrix
        });
        if cancellation_requested() {
            return None;
        }
        j.iter().all(|v| v.is_finite()).then_some(j)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pchip_slope_chain_rule_matches_five_point_differences_in_each_smooth_branch() {
        for y in [
            vec![1., 1.1, 2., 3., 3.2, 2., 1.8, 1.],
            vec![0., 0.1, 3., 4., 5., 6., 9., 9.1],
            vec![4., 2., 1., 1.5, 2., 1., 0., -0.1],
        ] {
            let direction: Vec<_> = (0..y.len()).map(|i| (i as f64 * 1.73).sin()).collect();
            let exact = slope_tangent(&direction, &slope_weights(&y));
            let h = 1e-5;
            let samples: Vec<_> = [-2., -1., 1., 2.]
                .iter()
                .map(|f| {
                    pchip_slopes(
                        &y.iter()
                            .zip(&direction)
                            .map(|(a, b)| a + f * h * b)
                            .collect::<Vec<_>>(),
                        0.01,
                    )
                })
                .collect();
            for i in 0..y.len() {
                let reference = (samples[0][i] - 8. * samples[1][i] + 8. * samples[2][i]
                    - samples[3][i])
                    / (12. * h);
                assert!(
                    (reference - exact[i]).abs() < 1e-7 * exact[i].abs().max(1.),
                    "slope {i}: {} vs {reference}",
                    exact[i]
                );
            }
        }
    }
}

#[cfg(test)]
mod limiter_tests {
    use super::*;
    #[test]
    fn limiter_crossing_detection_is_local_to_observed_slopes_and_respects_direction() {
        let grid = [0., 1., 1., 2., 3., 4.];
        let d = [0., 0., 1., 0., 0., 0.];
        assert!(crosses_limiter(&grid, &d, &[1], 1e-5, 1e-5));
        assert!(!crosses_limiter(&grid, &d, &[4], 1e-5, 1e-5));
        assert!(!crosses_limiter(&grid, &[0.; 6], &[1], 1e-5, 1e-5));
        assert!(!crosses_limiter(&grid, &d, &[], 1e-5, 1e-5));
    }
    #[test]
    fn observed_pchip_limiter_crossing_uses_the_existing_numerical_column() {
        let data: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/transmission-performance.json"
        ))
        .unwrap();
        let mut p: Project = serde_json::from_value(data["cases"][0]["project"].clone()).unwrap();
        p.spectrum.x.push(0.2637);
        p.spectrum.x.sort_by(f64::total_cmp);
        p.spectrum.y = vec![20000.; p.spectrum.x.len()];
        let m = Prepared::new(&p).unwrap();
        let k = m
            .free
            .iter()
            .position(|&e| m.entries[e].id == "site:0:cs")
            .unwrap();
        let j = m.analytical_derivative(&m.initial).unwrap();
        assert_eq!(j.column(k).as_slice(), m.derivative_column(&m.initial, k));
    }
}

#[cfg(test)]
mod stencil_tests {
    use super::*;
    #[test]
    fn local_stencils_match_full_interpolation_tangents_including_both_edges() {
        let grid: Vec<_> = (0..6001)
            .map(|i| 1. + 0.1 * (i as f64 * 0.17).sin())
            .collect();
        let direction: Vec<_> = (0..6001).map(|i| (i as f64 * 1.71).sin()).collect();
        let xs = [
            -30., -29.999, -29.98, -0.2637, 0., 0.0037, 29.98, 29.999, 30.,
        ];
        for gaussian in [false, true] {
            let (samples, _) = interpolation(&grid, &xs, gaussian);
            let tangent = slope_tangent(&direction, &slope_weights(&grid));
            for (sample, &x) in samples.iter().zip(&xs) {
                let reference = if gaussian {
                    smooth_grid_sample(&direction, x)
                } else {
                    pchip(&direction, &tangent, x)
                };
                let actual = sample.value(&direction);
                assert!(
                    (actual - reference).abs() < 2e-13 * reference.abs().max(1.),
                    "x={x} gaussian={gaussian}: {actual} != {reference}"
                );
            }
        }
    }
}
