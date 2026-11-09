//! Householder QR reduction before Jacobi SVD. No normal equations.
use super::{scaled_norm, DenseSvd, Scalar};

#[derive(Clone, Debug)]
pub(super) struct ImplicitQ<F> {
    reflectors: Vec<F>,
    tau: Vec<F>,
    rows: usize,
    cols: usize,
}
impl<F: Scalar> ImplicitQ<F> {
    pub(super) fn apply_transpose(&self, rhs: &[F]) -> Vec<F> {
        assert_eq!(rhs.len(), self.rows);
        let mut y = rhs.to_vec();
        for k in 0..self.cols {
            let mut dot = y[k];
            for i in k + 1..self.rows {
                dot = dot + self.reflectors[i * self.cols + k] * y[i];
            }
            dot = self.tau[k] * dot;
            y[k] = y[k] - dot;
            for i in k + 1..self.rows {
                y[i] = y[i] - self.reflectors[i * self.cols + k] * dot;
            }
        }
        y.truncate(self.cols);
        y
    }
}
impl<F: Scalar> DenseSvd<F> {
    #[cfg(test)]
    fn expanded_u(&self) -> Vec<F> {
        let Some(q) = &self.qr else {
            return self.u.clone();
        };
        let n = self.singular.len();
        let mut u = vec![F::zero(); self.rows * n];
        u[..n * n].copy_from_slice(&self.u);
        for k in (0..n).rev() {
            for j in 0..n {
                let mut dot = u[k * n + j];
                for i in k + 1..self.rows {
                    dot = dot + q.reflectors[i * n + k] * u[i * n + j];
                }
                dot = q.tau[k] * dot;
                u[k * n + j] = u[k * n + j] - dot;
                for i in k + 1..self.rows {
                    u[i * n + j] = u[i * n + j] - q.reflectors[i * n + k] * dot;
                }
            }
        }
        u
    }

    /// Compress tall, nontrivial models. Preserve original row-dependent
    /// convergence/rank thresholds and retain the direct SVD near rank loss.
    pub(crate) fn factor_compressed(rows: usize, cols: usize, mut a: Vec<F>) -> Option<Self> {
        assert!(rows >= cols && cols > 0);
        assert_eq!(a.len(), rows * cols);
        if cols < 3 || rows < 4 * cols {
            return Self::factor(rows, cols, a);
        }
        if a.iter().any(|v| !v.is_finite()) {
            return None;
        }
        let scale = a.iter().fold(F::zero(), |s, v| s.max(v.abs()));
        if scale == F::zero() {
            return Self::factor(rows, cols, a);
        }
        // Keep the original input only for a numerical fallback. QR works on
        // normalized entries, protecting both large and tiny physical scales.
        let original = a.clone();
        for v in &mut a {
            *v = *v / scale;
        }
        // Tiny reduced models retain ordered norms. Their solve cost is small,
        // and near-exact calibration fits are sensitive to norm rounding.
        let accelerated_norms = cols >= 8;
        let mut tau = vec![F::zero(); cols];
        for k in 0..cols {
            let length = if accelerated_norms {
                scaled_norm(rows - k, |i| a[(i + k) * cols + k])
            } else {
                (k..rows).fold(F::zero(), |s, i| s.hypot(a[i * cols + k]))
            };
            if length == F::zero() {
                continue;
            }
            let x0 = a[k * cols + k];
            let alpha = -length.copysign(x0);
            let v0 = x0 - alpha;
            tau[k] = (alpha - x0) / alpha;
            a[k * cols + k] = alpha;
            for i in k + 1..rows {
                a[i * cols + k] = a[i * cols + k] / v0;
            }
            for j in k + 1..cols {
                let mut dot = a[k * cols + j];
                for i in k + 1..rows {
                    dot = dot + a[i * cols + k] * a[i * cols + j];
                }
                dot = tau[k] * dot;
                a[k * cols + j] = a[k * cols + j] - dot;
                for i in k + 1..rows {
                    a[i * cols + j] = a[i * cols + j] - a[i * cols + k] * dot;
                }
            }
        }
        if a.iter().chain(&tau).any(|v| !v.is_finite()) {
            return Self::factor(rows, cols, original);
        }
        let r = (0..cols)
            .flat_map(|i| {
                let a = &a;
                (0..cols).map(move |j| if j >= i { a[i * cols + j] } else { F::zero() })
            })
            .collect();
        let Some(mut small) =
            Self::factor_with_row_tolerance(cols, cols, r, rows, accelerated_norms)
        else {
            return Self::factor(rows, cols, original);
        };
        let largest = small.singular.iter().copied().fold(F::zero(), F::max);
        if small
            .singular
            .iter()
            .any(|&s| s <= F::epsilon().sqrt() * largest)
        {
            return Self::factor(rows, cols, original);
        }
        for s in &mut small.singular {
            *s = *s * scale;
        }
        if small
            .singular
            .iter()
            .chain(&small.u)
            .any(|v| !v.is_finite())
        {
            return Self::factor(rows, cols, original);
        }
        Some(Self {
            singular: small.singular,
            u: small.u,
            v: small.v,
            rows,
            qr: Some(ImplicitQ {
                reflectors: a,
                tau,
                rows,
                cols,
            }),
            #[cfg(test)]
            compressed: true,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn qr_compression_preserves_factors_and_trust_steps_across_scales() {
        for n in [3, 8, 16] {
            for m in [64_usize.max(4 * n), 257] {
                for scale in [1e-150, 1., 1e150] {
                    let a: Vec<f64> = (0..m * n)
                        .map(|k| {
                            let i = k / n;
                            let j = k % n;
                            scale
                                * (((i * 37 + j * 19 + 7) as f64 * 0.731).sin()
                                    + if i == j { 3. } else { 0. })
                        })
                        .collect();
                    let old = DenseSvd::factor(m, n, a.clone()).unwrap();
                    let new = DenseSvd::factor_compressed(m, n, a.clone()).unwrap();
                    assert!(new.compressed);
                    let mut s = old.singular.clone();
                    let mut t = new.singular.clone();
                    s.sort_by(f64::total_cmp);
                    t.sort_by(f64::total_cmp);
                    for (s, t) in s.iter().zip(t) {
                        assert!((s - t).abs() <= 2e-11 * s.abs(), "singular values");
                    }
                    assert_eq!(
                        new.u.len(),
                        n * n,
                        "production retains only the small left factor"
                    );
                    let expanded = new.expanded_u();
                    let error = (0..m * n).fold(0_f64, |e, k| {
                        let i = k / n;
                        let j = k % n;
                        let v = (0..n)
                            .map(|l| expanded[i * n + l] * new.singular[l] * new.v[j * n + l])
                            .sum::<f64>();
                        e.hypot(v - a[k])
                    });
                    let norm = a.iter().fold(0_f64, |s, &v| s.hypot(v));
                    assert!(error <= 2e-11 * norm);
                    let rhs: Vec<_> = (0..m).map(|i| scale * (i as f64 * 0.17).cos()).collect();
                    let prepared = new.compressed_rhs(&rhs).unwrap();
                    for radius in [0.001, 1., 100.] {
                        let p = old.trust_step(&rhs, radius, None, 50).unwrap();
                        let q = new.trust_step(&rhs, radius, None, 50).unwrap();
                        assert_eq!(
                            q,
                            new.trust_step_with_projection(&rhs, Some(&prepared), radius, None, 50)
                                .unwrap()
                        );
                        let error = p.iter().zip(&q).fold(0_f64, |s, (a, b)| s.hypot(a - b));
                        let norm = p.iter().fold(0_f64, |s, &v| s.hypot(v));
                        assert!(
                            error <= 2e-9 * norm.max(1e-12),
                            "step {m}x{n}, scale {scale}, radius {radius}: {error}/{norm}"
                        );
                    }
                }
            }
        }
    }
    #[test]
    fn implicit_q_keeps_rhs_changes_and_rejected_trial_projections_independent() {
        let (m, n) = (80, 4);
        let a: Vec<f64> = (0..m * n)
            .map(|k| ((k as f64) * 0.17).cos() + if k / n == k % n { 2. } else { 0. })
            .collect();
        let factor = DenseSvd::factor_compressed(m, n, a).unwrap();
        let full = factor.expanded_u();
        let mut first = None;
        for index in [0, 1, 0] {
            let rhs: Vec<f64> = (0..m)
                .map(|i| ((i as f64) * 0.23 + index as f64).sin())
                .collect();
            let prepared = factor.compressed_rhs(&rhs).unwrap();
            for j in 0..n {
                let expected = (0..m).map(|i| full[i * n + j] * rhs[i]).sum::<f64>();
                assert!((prepared[j] - expected).abs() < 2e-12);
            }
            for radius in [0.001, 0.1, 10.] {
                assert_eq!(
                    factor.trust_step(&rhs, radius, None, 50),
                    factor.trust_step_with_projection(&rhs, Some(&prepared), radius, None, 50)
                );
            }
            if index == 0 {
                if let Some(old) = first.as_ref() {
                    assert_eq!(&prepared, old);
                } else {
                    first = Some(prepared);
                }
            }
        }
    }
    #[test]
    fn qr_compression_retains_direct_svd_for_small_and_near_rank_deficient_models() {
        for (m, n) in [(20, 2), (6, 3), (64, 3)] {
            let a: Vec<f64> = (0..m * n)
                .map(|k| {
                    let i = k / n;
                    let j = k % n;
                    if j == 2 {
                        2. * (i as f64).sin()
                    } else if j == 0 {
                        (i as f64).sin()
                    } else {
                        (i as f64 * 0.3).cos()
                    }
                })
                .collect();
            let old = DenseSvd::factor(m, n, a.clone()).unwrap();
            let new = DenseSvd::factor_compressed(m, n, a).unwrap();
            assert!(!new.compressed);
            assert_eq!(old.singular, new.singular);
            assert_eq!(old.u, new.u);
            assert_eq!(old.v, new.v);
            assert_eq!(new.rows, m);
        }
        assert!(DenseSvd::factor_compressed(20, 3, vec![f64::NAN; 60]).is_none());
    }
}
