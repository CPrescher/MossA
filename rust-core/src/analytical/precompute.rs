//! Immutable spectrum and parameter-layout work shared by solver clones.
use super::*;

pub(crate) struct EvaluationPlan {
    pub weights: Arc<Vec<f64>>,
    pub powers: Arc<Vec<Vec<f64>>>,
    pub maps: Vec<distribution::Mapping>,
    pub site_entries: Vec<(usize, usize, usize)>,
    pub background_entries: Vec<(i32, usize)>,
}
impl EvaluationPlan {
    pub fn new(
        p: &Project,
        entries: &[Entry],
        roots: &[(usize, f64)],
        free: &[usize],
        scale: &[f64],
    ) -> Self {
        let maps: Vec<distribution::Mapping> = roots
            .iter()
            .map(|&(root, factor)| {
                free.iter()
                    .position(|&r| r == root)
                    .map(|k| (k, factor * scale[k]))
                    .filter(|&(_, f)| f != 0.)
                    .into_iter()
                    .collect()
            })
            .collect();
        let mut site_entries = Vec::new();
        let mut background_entries = Vec::new();
        for (i, entry) in entries.iter().enumerate() {
            if let Some(site) = entry.site {
                if let Some(key) = KEYS.iter().position(|&k| k == entry.key) {
                    site_entries.push((site, key, i));
                }
            } else if let Ok(degree) = entry.key.parse::<i32>() {
                background_entries.push((degree, i));
            }
        }
        Self {
            weights: Arc::new(
                p.spectrum
                    .y
                    .iter()
                    .map(|&y| {
                        if p.weighting == "counts" {
                            y.sqrt()
                        } else {
                            1.
                        }
                    })
                    .collect(),
            ),
            // Store exactly powi(degree), not a recurrence with new rounding.
            powers: Arc::new(
                (0..p.background.len())
                    .map(|d| p.spectrum.x.iter().map(|v| v.powi(d as i32)).collect())
                    .collect(),
            ),
            maps,
            site_entries,
            background_entries,
        }
    }
    pub fn reusing(
        entries: &[Entry],
        roots: &[(usize, f64)],
        free: &[usize],
        scale: &[f64],
        original: &Self,
        weights: Arc<Vec<f64>>,
    ) -> Self {
        // Recalculate scale-dependent products in the original order; share
        // only immutable grid powers/layout and this dataset's exact weights.
        let maps = roots
            .iter()
            .map(|&(root, factor)| {
                free.iter()
                    .position(|&r| r == root)
                    .map(|k| (k, factor * scale[k]))
                    .filter(|&(_, f)| f != 0.)
                    .into_iter()
                    .collect()
            })
            .collect();
        debug_assert_eq!(entries.len(), original.maps.len());
        Self {
            weights,
            powers: original.powers.clone(),
            maps,
            site_entries: original.site_entries.clone(),
            background_entries: original.background_entries.clone(),
        }
    }
}

pub(crate) type Scatter = Vec<Vec<(usize, usize, f64)>>;
pub(crate) struct ProjectionPlan {
    pub sites: Vec<Option<(usize, f64)>>,
    pub background: Vec<(i32, usize, f64)>,
    pub inverse: Vec<Option<usize>>,
    pub scatter: Option<(Scatter, Scatter)>,
}
impl ProjectionPlan {
    pub fn new(m: &Prepared, linear: &[usize], nonlinear: &[usize]) -> Self {
        let mut sites = vec![None; m.project.sites.len()];
        let mut background = Vec::new();
        for (i, e) in m.entries.iter().enumerate() {
            let (root, f) = m.roots[i];
            let Some(k) = m.free.iter().position(|&r| r == root) else {
                continue;
            };
            let Some(local) = linear.iter().position(|&j| j == k) else {
                continue;
            };
            if let Some(site) = e.site {
                if e.key == "intensity" {
                    sites[site] = Some((local, f * m.scale[k]));
                }
            } else if let Ok(degree) = e.key.parse::<i32>() {
                background.push((degree, local, f * m.scale[k]));
            }
        }
        let mut inverse = vec![None; m.free.len()];
        for (i, &k) in nonlinear.iter().enumerate() {
            inverse[k] = Some(i);
        }
        // Simplex maps vary with coordinates. Compile only invariant ordinary
        // maps; distributions retain their established dynamic chain rule.
        let scatter = m.simplexes.is_empty().then(|| {
            let mut full = vec![Vec::new(); sites.len()];
            let mut unit = full.clone();
            for &(site, key, entry) in &m.evaluation_plan.site_entries {
                for &(k, f) in &m.evaluation_plan.maps[entry] {
                    if let Some(local) = inverse[k] {
                        full[site].push((key, local, f));
                    }
                    unit[site].push((key, k, f));
                }
            }
            // Original assembly iterates KEYS, regardless of entry order.
            for v in full.iter_mut().chain(unit.iter_mut()) {
                v.sort_by_key(|t| t.0);
            }
            (full, unit)
        });
        Self {
            sites,
            background,
            inverse,
            scatter,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn velocity_calibration_retains_convergence_near_the_roundoff_floor() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/stable-norm-calibration.json"
        ))
        .unwrap();
        let p: Project = serde_json::from_value(fixture["project"].clone()).unwrap();
        let result = fit(&p).unwrap();
        assert!(result.converged);
        let objective = fixture["objective"].as_f64().unwrap();
        assert!((result.evaluation.objective - objective).abs() <= 1e-7_f64.max(1e-8 * objective));
        for (key, expected) in fixture["errors"].as_object().unwrap() {
            let next = result.errors[key];
            if expected.is_null() {
                assert!(next.is_none());
            } else {
                let expected = expected.as_f64().unwrap();
                assert!((next.unwrap() - expected).abs() <= 1e-10 + 1e-4 * expected);
            }
        }
    }

    #[test]
    fn immutable_plan_matches_original_weights_powers_and_root_chain_rule() {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/transmission-performance.json"
        ))
        .unwrap();
        for c in fixtures["cases"].as_array().unwrap() {
            let p: Project = serde_json::from_value(c["project"].clone()).unwrap();
            let m = Prepared::with_source_calibration(&p, c["calibration"] == true).unwrap();
            let plan = &m.evaluation_plan;
            for (row, &y) in p.spectrum.y.iter().enumerate() {
                assert_eq!(
                    plan.weights[row].to_bits(),
                    (if p.weighting == "counts" {
                        y.sqrt()
                    } else {
                        1.
                    })
                    .to_bits()
                );
                for degree in 0..p.background.len() {
                    assert_eq!(
                        plan.powers[degree][row].to_bits(),
                        p.spectrum.x[row].powi(degree as i32).to_bits()
                    );
                }
            }
            for (i, &(root, factor)) in m.roots.iter().enumerate() {
                let mut expected = Vec::new();
                if let Some(k) = m.free.iter().position(|&r| r == root) {
                    let value = factor * m.scale[k];
                    if value != 0. {
                        expected.push((k, value));
                    }
                }
                assert_eq!(plan.maps[i], expected);
            }
            if m.simplexes.is_empty() {
                assert_eq!(
                    m.parameter_maps(&m.initial),
                    (plan.maps.clone(), vec![false; m.free.len()])
                );
            }
        }
    }
}
