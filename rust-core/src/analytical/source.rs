//! Fixed-anchor source-mixture derivatives, including recentering and the
//! discrete source-area normalization used by the forward model.
use super::*;
impl Prepared {
    pub(super) fn source_derivatives(
        &self,
        p: &Project,
        maps: &[distribution::Mapping],
        n: usize,
    ) -> Option<DMatrix<f64>> {
        if !self.source_calibration {
            return None;
        }
        let mut jac = DMatrix::<f64>::zeros(6001, n);
        if let Some(gs) = &p.source_gaussians {
            let weight = gs.iter().map(|g| g.weight).sum::<f64>();
            let mean = gs.iter().map(|g| g.weight * g.center).sum::<f64>() / weight;
            let norm = (4. * 2_f64.ln() / PI).sqrt();
            let a = 4. * 2_f64.ln();
            let mut raw = vec![0.; 6001];
            let entries: Vec<_> = self
                .entries
                .iter()
                .enumerate()
                .filter_map(|(e, v)| {
                    let key = v.key.strip_prefix("gaussian:")?;
                    let (i, field) = key.split_once(':')?;
                    Some((i.parse::<usize>().ok()?, field, &maps[e]))
                })
                .collect();
            for row in 0..6001 {
                let v = -30. + row as f64 * 0.01;
                let mut components = [(0., 0., 0.); 3];
                let mut center_sum = 0.;
                for (i, g) in gs.iter().enumerate() {
                    let z = v - g.center + mean;
                    let exponential = (-a * (z / g.fwhm).powi(2)).exp();
                    let value = norm / g.fwhm * exponential;
                    let dc = value * 2. * a * z / (g.fwhm * g.fwhm);
                    let dw = value * (-1. + 2. * a * (z / g.fwhm).powi(2)) / g.fwhm;
                    raw[row] += (g.weight / weight) * norm / g.fwhm * exponential;
                    center_sum += (g.weight / weight) * dc;
                    components[i] = (value, dc, dw);
                }
                for &(i, field, map) in &entries {
                    let g = &gs[i];
                    let (value, dc, dw) = components[i];
                    let d = match field {
                        "fwhm" => (g.weight / weight) * dw,
                        "center" => (g.weight / weight) * (dc - center_sum),
                        _ => (value - raw[row]) / weight - center_sum * (g.center - mean) / weight,
                    };
                    for &(k, factor) in map {
                        jac[(row, k)] += d * factor;
                    }
                }
            }
            let area = raw.iter().sum::<f64>() * 0.01;
            for k in 0..n {
                let da = jac.column(k).iter().sum::<f64>() * 0.01;
                for row in 0..6001 {
                    jac[(row, k)] = (jac[(row, k)] - raw[row] / area * da) / area;
                }
            }
        } else {
            for (i, e) in self.entries.iter().enumerate() {
                if e.key != "source_fwhm" {
                    continue;
                }
                for row in 0..6001 {
                    let d = profile_partials(
                        -30. + row as f64 * 0.01,
                        0.,
                        p.source_fwhm,
                        1.,
                        if p.source_squared {
                            ProfileShape::LorSquared
                        } else {
                            ProfileShape::Lorentzian
                        },
                        0.,
                    )[1];
                    for &(k, factor) in &maps[i] {
                        jac[(row, k)] += d * factor;
                    }
                }
            }
        }
        Some(jac)
    }
}
