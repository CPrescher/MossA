//! MossA extended Voigt-based fitting (cxVBF.m / cta_fit.m / voigt_curve.m).
use super::{Entry, Parameter, Project, Site};
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Component {
    pub center: Parameter,
    pub width: Parameter,
    pub weight: Parameter,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Xvbf {
    pub delta: Parameter,
    pub cs: Vec<Component>,
    pub qs: Vec<Component>,
}

// Literal four-pole approximation from voigt_curve.m. Retain the legacy width
// parameters: they are not conventional Gaussian/Lorentzian FWHMs.
pub fn voigt(x: f64, center: f64, width: f64, lorentz: f64, area: f64) -> f64 {
    let coeff = [
        (-1.2150, 1.2359, -0.3085, 0.0210),
        (-1.3509, 0.3786, 0.5906, -1.1858),
        (-1.2150, -1.2359, -0.3085, -0.0210),
        (-1.3509, -0.3786, 0.5906, 1.1858),
    ];
    if width < 1e-10 {
        // Analytic limit of the same approximation; MATLAB divides by zero here.
        return area * 0.5642 / PI.sqrt() * lorentz / ((x - center).powi(2) + lorentz * lorentz);
    }
    let a = (x - center) / (width * 2. * 2_f64.sqrt());
    let b = lorentz / (width * 2. * 2_f64.sqrt());
    area / (2. * (2. * PI).sqrt() * width)
        * coeff
            .iter()
            .map(|&(r, i, c, d)| (c * (b - r) + d * (a - i)) / ((b - r).powi(2) + (a - i).powi(2)))
            .sum::<f64>()
}
pub fn curve(site: &Site, x: f64) -> f64 {
    let model = site.xvbf.as_ref().unwrap();
    model
        .cs
        .iter()
        .flat_map(|cs| {
            model.qs.iter().map(move |qs| {
                let c = cs.center.value;
                let q = qs.center.value;
                let u = cs.width.value;
                let v = qs.width.value;
                let area = site.params["intensity"].value * cs.weight.value * qs.weight.value / 2.;
                let base = u * u + 0.25 * v * v;
                let correlation = model.delta.value * u * v;
                voigt(
                    x,
                    c + q / 2.,
                    (base + correlation).max(0.).sqrt(),
                    0.194,
                    area,
                ) + voigt(
                    x,
                    c - q / 2.,
                    (base - correlation).max(0.).sqrt(),
                    0.194,
                    area,
                )
            })
        })
        .sum()
}
pub fn parameter<'a>(site: &'a Site, key: &str) -> &'a Parameter {
    let Some(x) = &site.xvbf else {
        return &site.params[key];
    };
    if key == "delta" {
        return &x.delta;
    }
    let bits: Vec<_> = key.split(':').collect();
    if bits.len() != 3 {
        return &site.params[key];
    }
    let c = &if bits[0] == "csd" { &x.cs } else { &x.qs }[bits[1].parse::<usize>().unwrap()];
    match bits[2] {
        "center" => &c.center,
        "width" => &c.width,
        _ => &c.weight,
    }
}
pub fn parameter_mut<'a>(site: &'a mut Site, key: &str) -> &'a mut Parameter {
    if key == "delta" {
        return &mut site.xvbf.as_mut().unwrap().delta;
    }
    let bits: Vec<_> = key.split(':').collect();
    if bits.len() != 3 {
        return site.params.get_mut(key).unwrap();
    }
    let x = site.xvbf.as_mut().unwrap();
    let c = &mut if bits[0] == "csd" {
        &mut x.cs
    } else {
        &mut x.qs
    }[bits[1].parse::<usize>().unwrap()];
    match bits[2] {
        "center" => &mut c.center,
        "width" => &mut c.width,
        _ => &mut c.weight,
    }
}
pub fn validate(s: &Site) -> Result<(), String> {
    let Some(x) = &s.xvbf else {
        return Ok(());
    };
    if s.kind != "Doublet" || s.profile != "Lorentzian" {
        return Err("xVBF requires a Lorentzian doublet site.".into());
    }
    if ["cs", "qs"]
        .iter()
        .any(|k| s.params.get(*k).is_none_or(|p| !p.value.is_finite()))
    {
        return Err("xVBF requires finite CS/QS summary parameters.".into());
    }
    for list in [&x.cs, &x.qs] {
        if list.is_empty() || list.len() > 8 {
            return Err("xVBF requires 1–8 components in each distribution.".into());
        }
        if list
            .iter()
            .any(|c| !c.weight.value.is_finite() || c.weight.value < 0. || c.weight.value > 1.)
            || (list.iter().map(|c| c.weight.value).sum::<f64>() - 1.).abs() > 1e-9
        {
            return Err(
                "Each xVBF distribution must have nonnegative weights summing to one.".into(),
            );
        }
        if list.iter().any(|c| {
            [&c.center, &c.width, &c.weight]
                .iter()
                .any(|p| p.link.is_some())
        }) {
            return Err("Links on xVBF distribution parameters are not supported; use their fixed flags and bounds.".into());
        }
    }
    if x.delta.link.is_some() {
        return Err("Links on xVBF coupling are not supported.".into());
    }
    Ok(())
}
pub fn entries(out: &mut Vec<Entry>, site: usize, x: &Xvbf) {
    let mut push = |key: String, p: &Parameter, lo: f64, hi: f64| {
        out.push(Entry {
            id: format!("site:{site}:{key}"),
            param: p.clone(),
            site: Some(site),
            key,
            lower: lo,
            upper: hi,
        })
    };
    push("delta".into(), &x.delta, -1., 1.);
    for (axis, list) in [("csd", &x.cs), ("qsd", &x.qs)] {
        for (j, c) in list.iter().enumerate() {
            push(
                format!("{axis}:{j}:center"),
                &c.center,
                if axis == "qsd" { 0. } else { f64::NEG_INFINITY },
                f64::INFINITY,
            );
            push(format!("{axis}:{j}:width"), &c.width, 0., f64::INFINITY);
            push(format!("{axis}:{j}:weight"), &c.weight, 0., 1.);
        }
    }
}
#[derive(Clone)]
pub struct Simplex {
    pub site: usize,
    pub indices: Vec<usize>,
    pub lower: Vec<f64>,
    pub upper: Vec<f64>,
    pub mass: f64,
}
// Bounded stick-breaking: conditional intervals enforce the exact sum and all
// physical weight bounds on EVERY solver trial, including fixed weights.
pub fn simplexes(entries: &mut [Entry], project: &Project) -> Result<Vec<Simplex>, String> {
    let mut result = vec![];
    if entries.iter().any(|e| {
        e.param
            .link
            .as_ref()
            .is_some_and(|l| l.target.ends_with(":weight"))
    }) {
        return Err("Links to xVBF weights are not supported.".into());
    }
    for (i, site) in project.sites.iter().enumerate() {
        if site.xvbf.is_none() {
            continue;
        }
        for axis in ["csd", "qsd"] {
            let all: Vec<_> = entries
                .iter()
                .enumerate()
                .filter(|(_, e)| {
                    e.site == Some(i)
                        && e.key.starts_with(&format!("{axis}:"))
                        && e.key.ends_with(":weight")
                })
                .map(|(j, _)| j)
                .collect();
            let indices: Vec<_> = all
                .iter()
                .copied()
                .filter(|&j| entries[j].param.fit && entries[j].lower < entries[j].upper)
                .collect();
            if indices.is_empty() {
                continue;
            }
            let mass = 1.
                - all
                    .iter()
                    .filter(|j| !indices.contains(j))
                    .map(|&j| entries[j].param.value)
                    .sum::<f64>();
            let lo: Vec<_> = indices.iter().map(|&j| entries[j].lower).collect();
            let hi: Vec<_> = indices.iter().map(|&j| entries[j].upper).collect();
            if mass < lo.iter().sum::<f64>() - 1e-9 || mass > hi.iter().sum::<f64>() + 1e-9 {
                return Err("Infeasible xVBF weight bounds or fixed weights.".into());
            }
            let forced = (mass - lo.iter().sum::<f64>()).abs() < 1e-12
                || (mass - hi.iter().sum::<f64>()).abs() < 1e-12;
            let mut remaining = mass;
            for (k, &j) in indices.iter().enumerate() {
                let lower = lo[k].max(remaining - hi[k + 1..].iter().sum::<f64>());
                let upper = hi[k].min(remaining - lo[k + 1..].iter().sum::<f64>());
                let value = entries[j].param.value;
                remaining -= value;
                let latent = if upper > lower {
                    (value - lower) / (upper - lower)
                } else {
                    0.5
                };
                let e = &mut entries[j];
                e.param.value = latent.clamp(0., 1.);
                e.param.min = Some(0.);
                e.param.max = Some(1.);
                e.lower = 0.;
                e.upper = 1.;
                if k == indices.len() - 1 || forced {
                    e.param.fit = false;
                }
            }
            result.push(Simplex {
                site: i,
                indices,
                lower: lo,
                upper: hi,
                mass,
            });
        }
    }
    Ok(result)
}
pub fn expand(groups: &[Simplex], p: &mut Project, values: &[f64], entries: &[Entry]) {
    for group in groups {
        let mut remaining = group.mass;
        for (k, &j) in group.indices.iter().enumerate() {
            let lower = group.lower[k].max(remaining - group.upper[k + 1..].iter().sum::<f64>());
            let upper = group.upper[k].min(remaining - group.lower[k + 1..].iter().sum::<f64>());
            let value = if k + 1 == group.indices.len() {
                remaining
            } else {
                lower + (upper - lower).max(0.) * values[j]
            };
            parameter_mut(&mut p.sites[group.site], &entries[j].key).value = value;
            remaining -= value;
        }
    }
    for site in &mut p.sites {
        if let Some(x) = &site.xvbf {
            site.params.get_mut("cs").unwrap().value =
                x.cs.iter().map(|c| c.center.value * c.weight.value).sum();
            site.params.get_mut("qs").unwrap().value =
                x.qs.iter().map(|c| c.center.value * c.weight.value).sum();
        }
    }
}
