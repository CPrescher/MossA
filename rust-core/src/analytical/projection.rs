//! Thin projected Jacobian and residual-dependent correction in one profile pass.
use super::*;

// Share geometry, while retaining each original area-dependent expression and
// its multiplication order. Do not obtain actual-area derivatives by scaling
// already-rounded unit-area derivatives.
fn profile_partials_pair(
    x: f64,
    center: f64,
    width: f64,
    area: f64,
    unit_area: f64,
    shape: ProfileShape,
    mix: f64,
) -> ([f64; 4], [f64; 4]) {
    let h = width / 2.;
    let z = (x - center) / h;
    let u = 1. + z * z;
    let l = matches!(shape, ProfileShape::Lorentzian | ProfileShape::PseudoVoigt)
        .then(|| 1. / (PI * h * u));
    let g = matches!(shape, ProfileShape::Gaussian | ProfileShape::PseudoVoigt)
        .then(|| 0.8326 / (h * 1.7725) * (-(z * 0.8326).powi(2)).exp());
    let finish = |area: f64| {
        let lorentzian = || {
            let l = l.unwrap();
            [
                area * l * 2. * z / (h * u),
                area * l * (z * z - 1.) / (width * u),
                l,
                0.,
            ]
        };
        let gaussian = || {
            let g = g.unwrap();
            [
                area * g * 2. * 0.8326_f64.powi(2) * z / h,
                area * g * (2. * 0.8326_f64.powi(2) * z * z - 1.) / width,
                g,
                0.,
            ]
        };
        match shape {
            ProfileShape::Lorentzian => lorentzian(),
            ProfileShape::Gaussian => gaussian(),
            ProfileShape::LorSquared => {
                let q = 2. / (PI * h * u * u);
                [
                    area * q * 4. * z / (h * u),
                    area * q * (3. * z * z - 1.) / (width * u),
                    q,
                    0.,
                ]
            }
            ProfileShape::PseudoVoigt => {
                let l = lorentzian();
                let g = gaussian();
                [
                    mix * l[0] + (1. - mix) * g[0],
                    mix * l[1] + (1. - mix) * g[1],
                    mix * l[2] + (1. - mix) * g[2],
                    area * (l[2] - g[2]),
                ]
            }
        }
    };
    (finish(area), finish(unit_area))
}
impl Lines<'_> {
    fn paired_partials(&self, unit: &Self, x: f64) -> ([f64; 8], [f64; 8]) {
        let (mut actual, mut one) = ([0.; 8], [0.; 8]);
        let accumulate = |sum: &mut [f64; 8], d: [f64; 4], center: [f64; 2], area: [f64; 3]| {
            sum[0] += d[0];
            sum[1] += d[1];
            sum[2] += d[2] * area[0];
            sum[3] += d[0] * center[0];
            sum[4] += d[0] * center[1];
            sum[5] += d[2] * area[1];
            sum[6] += d[2] * area[2];
            sum[7] += d[3];
        };
        for line in 0..self.curve.count {
            let (center, area) = self.curve.lines[line];
            let (d, u) = profile_partials_pair(
                x,
                center,
                self.curve.fwhm,
                area,
                unit.curve.lines[line].1,
                self.curve.shape,
                self.curve.mix,
            );
            accumulate(&mut actual, d, self.center[line], self.area[line]);
            accumulate(&mut one, u, unit.center[line], unit.area[line]);
        }
        (actual, one)
    }
}
impl Prepared {
    #[cfg(test)]
    pub(crate) fn fused_projection_jacobian(
        &self,
        x: &[f64],
        linear: &[usize],
        nonlinear: &[usize],
        residual: &DVector<f64>,
    ) -> Option<(DMatrix<f64>, DMatrix<f64>)> {
        self.fused_projection_jacobian_planned(
            x,
            linear,
            nonlinear,
            residual,
            &ProjectionPlan::new(self, linear, nonlinear),
        )
    }
    pub(crate) fn fused_projection_jacobian_planned(
        &self,
        x: &[f64],
        linear: &[usize],
        nonlinear: &[usize],
        residual: &DVector<f64>,
        plan: &ProjectionPlan,
    ) -> Option<(DMatrix<f64>, DMatrix<f64>)> {
        if !self.uses_analytical_derivatives()
            || self.project.mode != "thin"
            || self.source_calibration
        {
            return None;
        }
        // An existing fused-forward snapshot is cheaper and preserves that
        // path's established arithmetic. Nonsmooth cases retain the old path.
        if self
            .absorber_snapshot
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|(key, _)| key == x)
        {
            return None;
        }
        let p = self.expand(x);
        let mut unit = p.clone();
        let site_columns = &plan.sites;
        for (site, column) in site_columns.iter().enumerate() {
            if column.is_some() {
                unit.sites[site].params.get_mut("intensity").unwrap().value = 1.;
            }
        }
        let full_lines = self.line_derivatives(&p, x);
        let unit_lines = self.line_derivatives(&unit, x);
        if nonlinear
            .iter()
            .any(|&k| full_lines.fallback[k] || unit_lines.fallback[k])
        {
            return None;
        }
        let inverse = &plan.inverse;
        let dynamic_scatter;
        let (scatter, unit_scatter) = if let Some(v) = &plan.scatter {
            (&v.0, &v.1)
        } else {
            let actual = full_lines
                .sites
                .iter()
                .map(|line| {
                    line.columns
                        .iter()
                        .enumerate()
                        .filter_map(|(i, c)| {
                            c.and_then(|(k, f)| inverse[k].map(|local| (i, local, f)))
                        })
                        .collect()
                })
                .collect();
            let one = unit_lines
                .sites
                .iter()
                .map(|line| {
                    line.columns
                        .iter()
                        .enumerate()
                        .filter_map(|(i, c)| c.map(|(k, f)| (i, k, f)))
                        .collect()
                })
                .collect();
            dynamic_scatter = (actual, one);
            (&dynamic_scatter.0, &dynamic_scatter.1)
        };
        let mut j = DMatrix::<f64>::zeros(p.spectrum.x.len(), nonlinear.len());
        let mut c = DMatrix::<f64>::zeros(linear.len(), nonlinear.len());
        let mut gradient = vec![0.; x.len()];
        let mut unit_gradient = vec![0.; x.len()];
        for (row, &v) in p.spectrum.x.iter().enumerate() {
            if cancellation_requested() {
                return None;
            }
            let weight = self.evaluation_plan.weights[row];
            for &(degree, (k, factor)) in &full_lines.background {
                if let Some(local) = inverse[k] {
                    j[(row, local)] +=
                        self.evaluation_plan.powers[degree as usize][row] * factor / weight;
                }
            }
            for (site, line) in full_lines.sites.iter().enumerate() {
                let projected = site_columns[site];
                if let Some(distribution) = &line.distribution {
                    gradient.fill(0.);
                    if projected.is_some() {
                        unit_gradient.fill(0.);
                        distribution.accumulate_pair(
                            unit_lines.sites[site].distribution.as_ref().unwrap(),
                            v,
                            &mut gradient,
                            &mut unit_gradient,
                        );
                    } else {
                        line.accumulate(v, &mut gradient);
                    }
                    for (local, &k) in nonlinear.iter().enumerate() {
                        j[(row, local)] -= gradient[k] / weight;
                    }
                } else {
                    let (d, one) = if projected.is_some() {
                        let (a, b) = line.paired_partials(&unit_lines.sites[site], v);
                        (a, Some(b))
                    } else {
                        (line.partials(v), None)
                    };
                    for &(i, local, factor) in &scatter[site] {
                        j[(row, local)] -= d[i] * factor / weight;
                    }
                    if let Some(one) = one {
                        unit_gradient.fill(0.);
                        for &(i, k, f) in &unit_scatter[site] {
                            unit_gradient[k] += one[i] * f;
                        }
                    }
                }
                if let Some((local, f)) = projected {
                    for (k, &index) in nonlinear.iter().enumerate() {
                        c[(local, k)] -= unit_gradient[index] * f * residual[row] / weight;
                    }
                }
            }
        }
        (j.iter().chain(c.iter()).all(|v| v.is_finite())).then_some((j, c))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn par(value: f64, fit: bool) -> Parameter {
        Parameter {
            value,
            fit,
            min: None,
            max: None,
            link: None,
        }
    }
    fn model(kind: &str, shape: &str, counts: bool, linked: bool) -> Prepared {
        let f: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/transmission-performance.json"
        ))
        .unwrap();
        let mut p: Project = serde_json::from_value(
            f["cases"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == "thin-control")
                .unwrap()["project"]
                .clone(),
        )
        .unwrap();
        p.sites.truncate(1);
        p.sites[0].kind = kind.into();
        p.sites[0].profile = shape.into();
        p.sites[0].xvbf = None;
        p.sites[0].params = [
            ("cs", par(0.23, true)),
            ("fwhm", par(0.42, true)),
            ("intensity", par(400., true)),
            ("qs", par(1.8, true)),
            ("bhf", par(31.2, true)),
            ("a12", par(if kind == "Doublet" { 0.37 } else { 1.6 }, true)),
            ("a13", par(3.2, true)),
            ("mix", par(0.3, true)),
        ]
        .into_iter()
        .map(|(k, v)| (k.into(), v))
        .collect();
        p.background = vec![par(10000., true), par(0.2, true)];
        p.mode = "thin".into();
        p.weighting = if counts { "counts" } else { "unweighted" }.into();
        p.thin_solver = None;
        if linked {
            let mut s = p.sites[0].clone();
            s.params.get_mut("cs").unwrap().value += 1.4;
            s.params.get_mut("fwhm").unwrap().link = Some(Link {
                target: "site:0:fwhm".into(),
                factor: 1.5,
            });
            s.params.get_mut("intensity").unwrap().link = Some(Link {
                target: "site:0:intensity".into(),
                factor: 0.7,
            });
            p.sites.push(s);
            p.background[1].link = Some(Link {
                target: "site:0:intensity".into(),
                factor: 0.002,
            });
        }
        p.spectrum.y = evaluate(&p)
            .unwrap()
            .y
            .into_iter()
            .enumerate()
            .map(|(i, y)| y + 0.03 * (i as f64 * 1.72).sin())
            .collect();
        Prepared::new(&p).unwrap()
    }
    fn compare(m: &Prepared) {
        let problem = FitProblem::new(m, false);
        let projection = problem.projection.as_ref().unwrap();
        let x = problem.full_point(&problem.initial()).unwrap();
        let r = DVector::from_vec(m.residuals_shared(&x, false));
        let (j, c) = m
            .fused_projection_jacobian(&x, &projection.linear, &projection.nonlinear, &r)
            .unwrap();
        let full = m.derivative(&x);
        let (old, fallback) =
            m.projection_correction(&x, &projection.linear, &projection.nonlinear, &r);
        assert!(!fallback.iter().any(|&v| v));
        for row in 0..j.nrows() {
            for (k, &column) in projection.nonlinear.iter().enumerate() {
                assert_eq!(
                    j[(row, k)].to_bits(),
                    full[(row, column)].to_bits(),
                    "Jacobian {row}:{k}"
                );
            }
        }
        for (a, b) in c.iter().zip(old.iter()) {
            assert_eq!(a.to_bits(), b.to_bits(), "correction");
        }
    }
    #[test]
    fn fused_ordinary_projection_matches_separate_raw_blocks_bit_for_bit() {
        for kind in ["Singlet", "Doublet", "Sextet"] {
            for shape in ["Lorentzian", "Gaussian", "PseudoVoigt", "LorSquared"] {
                for counts in [false, true] {
                    compare(&model(kind, shape, counts, false));
                }
            }
        }
    }
    #[test]
    fn fused_projection_preserves_shared_intensity_background_and_shape_links() {
        for counts in [false, true] {
            compare(&model("Doublet", "PseudoVoigt", counts, true));
        }
    }
    #[test]
    fn fused_distribution_projection_matches_separate_raw_blocks_bit_for_bit() {
        let f: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/transmission-performance.json"
        ))
        .unwrap();
        let mut p: Project = serde_json::from_value(
            f["cases"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == "xvbf-transmission")
                .unwrap()["project"]
                .clone(),
        )
        .unwrap();
        p.mode = "thin".into();
        p.spectrum.y = evaluate(&p)
            .unwrap()
            .y
            .into_iter()
            .enumerate()
            .map(|(i, y)| y + 1e-5 * (i as f64 * 1.72).sin())
            .collect();
        compare(&Prepared::new(&p).unwrap());
    }
    #[test]
    fn paired_ordinary_kernels_retain_the_original_area_arithmetic() {
        for shape in [
            ProfileShape::Lorentzian,
            ProfileShape::Gaussian,
            ProfileShape::PseudoVoigt,
            ProfileShape::LorSquared,
        ] {
            for width in [1e-6, 0.2, 2.] {
                for area in [0., 0.7, 1e6] {
                    for x in [-4., 0.23, 1.7] {
                        let (a, b) = profile_partials_pair(x, 0.23, width, area, 0.35, shape, 0.3);
                        assert_eq!(
                            a.map(f64::to_bits),
                            profile_partials(x, 0.23, width, area, shape, 0.3).map(f64::to_bits)
                        );
                        assert_eq!(
                            b.map(f64::to_bits),
                            profile_partials(x, 0.23, width, 0.35, shape, 0.3).map(f64::to_bits)
                        );
                    }
                }
            }
        }
    }
    #[test]
    fn existing_forward_snapshots_and_numerical_requests_retain_the_reference_path() {
        let mut m = model("Doublet", "PseudoVoigt", false, false);
        let x = m.initial.clone();
        let r = DVector::from_vec(m.residuals(&x));
        let grid = Arc::new(m.absorber_grid(
            &m.expand(&x),
            &x,
            m.project.spectrum.x.iter().copied(),
            m.project.spectrum.x.len(),
        ));
        *m.absorber_snapshot.lock().unwrap() = Some((x.clone(), grid));
        assert!(m.fused_projection_jacobian(&x, &[0], &[1], &r).is_none());
        m.project.derivative_method = Some(DerivativeMethod::Numerical);
        assert!(m.fused_projection_jacobian(&x, &[0], &[1], &r).is_none());
    }
}
