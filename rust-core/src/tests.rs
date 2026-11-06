use super::*;
fn par(v: f64, free: bool) -> Parameter {
    Parameter {
        value: v,
        fit: free,
        min: None,
        max: None,
        link: None,
    }
}
fn project(kind: &str, shape: &str) -> Project {
    let mut params = BTreeMap::new();
    for (k, v, free) in [
        ("cs", 0.23, true),
        ("fwhm", 0.42, true),
        ("intensity", 400., true),
        ("qs", 1.8, true),
        ("bhf", 31.2, true),
        ("a12", if kind == "Doublet" { 0.37 } else { 1.6 }, false),
        ("a13", 3.2, false),
        ("mix", 0.3, false),
    ] {
        params.insert(k.into(), par(v, free));
    }
    let x: Vec<_> = (0..401).map(|i| -10. + 20. * i as f64 / 400.).collect();
    let mut p = Project {
        spectrum: Spectrum {
            x: x.clone(),
            y: vec![1000.; x.len()],
        },
        sites: vec![Site {
            name: "Test".into(),
            kind: kind.into(),
            profile: shape.into(),
            params,
        }],
        background: vec![par(1000., true)],
        mode: "thin".into(),
        source_fwhm: 0.097,
        source_squared: false,
        weighting: "unweighted".into(),
        max_iterations: 300,
    };
    p.spectrum.y = evaluate(&p).unwrap().y;
    p
}
#[test]
fn independent_reference_profiles() {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/reference-profiles.json")).unwrap();
    let x: Vec<f64> = serde_json::from_value(fixtures["x"].clone()).unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let p = project(
            case["kind"].as_str().unwrap(),
            case["profile"].as_str().unwrap(),
        );
        let expected: Vec<f64> = serde_json::from_value(case["absorption"].clone()).unwrap();
        for (&v, &want) in x.iter().zip(&expected) {
            let actual = site_curve(&p.sites[0], v);
            assert!(
                (actual - want).abs() < 1e-11 * want.abs().max(1.),
                "{} {} at {}: {} != {}",
                p.sites[0].kind,
                p.sites[0].profile,
                v,
                actual,
                want
            );
        }
    }
}
#[test]
fn recover_all_twelve_profile_combinations() {
    for kind in ["Singlet", "Doublet", "Sextet"] {
        for shape in ["Lorentzian", "Gaussian", "PseudoVoigt", "LorSquared"] {
            let mut p = project(kind, shape);
            let truth = p.clone();
            for (k, f) in [
                ("cs", 0.05),
                ("fwhm", 0.06),
                ("intensity", 30.),
                ("qs", 0.06),
                ("bhf", 0.15),
            ] {
                p.sites[0].params.get_mut(k).unwrap().value += f;
            }
            p.background[0].value = 1001.;
            let r = fit(&p).unwrap();
            assert!(
                r.evaluation.sse < 1e-7,
                "{kind} {shape}: {}",
                r.evaluation.sse
            );
            for k in active_keys(&truth.sites[0]) {
                assert!(
                    (get(&r.project.sites[0], k) - get(&truth.sites[0], k)).abs() < 1e-4,
                    "{kind} {shape} {k}"
                );
            }
            // At the floating-point floor, host math libraries can give different
            // stopping codes for noiseless data. Keep every parameter-recovery
            // assertion and require an even tighter residual for NoProgress.
            assert!(
                r.converged || (r.termination == "NumericalNoProgress" && r.evaluation.sse < 1e-12),
                "{kind} {shape}: {}, SSE={}",
                r.termination,
                r.evaluation.sse
            );
        }
    }
}
#[test]
fn linked_bounds_and_uncertainties() {
    let mut p = project("Doublet", "Lorentzian");
    let mut second = p.sites[0].clone();
    second.params.get_mut("cs").unwrap().value = 3.;
    second.params.get_mut("fwhm").unwrap().link = Some(Link {
        target: "site:0:fwhm".into(),
        factor: 2.,
    });
    second.params.get_mut("fwhm").unwrap().max = Some(1.);
    p.sites.push(second);
    p.spectrum.y = evaluate(&p)
        .unwrap()
        .y
        .iter()
        .enumerate()
        .map(|(i, y)| y + (i as f64 * 1.72).sin() * 0.01)
        .collect();
    p.sites[0].params.get_mut("fwhm").unwrap().value = 0.46;
    let r = fit(&p).unwrap();
    assert!(get(&r.project.sites[0], "fwhm") <= 0.5);
    assert!(
        (get(&r.project.sites[1], "fwhm") - 2. * get(&r.project.sites[0], "fwhm")).abs() < 1e-14
    );
    let a = r.errors["site:0:fwhm"].unwrap();
    let b = r.errors["site:1:fwhm"].unwrap();
    assert!((b - 2. * a).abs() < 1e-12);
}
#[test]
fn fixed_values_active_bounds_and_rank_deficiency() {
    let mut p = project("Singlet", "Lorentzian");
    p.sites[0].params.get_mut("cs").unwrap().fit = false;
    p.sites[0].params.get_mut("intensity").unwrap().max = Some(350.);
    p.sites[0].params.get_mut("intensity").unwrap().value = 300.;
    let r = fit(&p).unwrap();
    assert_eq!(get(&r.project.sites[0], "cs"), 0.23);
    assert!(get(&r.project.sites[0], "intensity") <= 350.);
    assert!(r.errors["site:0:intensity"].is_none());
    let mut q = project("Singlet", "Lorentzian");
    for p in q.sites[0].params.values_mut() {
        p.fit = false;
    }
    q.sites[0].params.get_mut("intensity").unwrap().fit = true;
    q.sites.push(q.sites[0].clone());
    q.spectrum.y = evaluate(&q).unwrap().y;
    let r = fit(&q).unwrap();
    assert!(r.rank < r.free_parameters);
    assert!(r.errors["site:0:intensity"].is_none());
}
#[test]
fn zero_parameters_and_count_weighting() {
    let mut p = project("Singlet", "Lorentzian");
    p.sites[0].params.get_mut("cs").unwrap().value = 0.;
    p.weighting = "counts".into();
    let r = fit(&p).unwrap();
    assert!(r.evaluation.sse < 1e-7);
    p.spectrum.y[0] = 0.;
    assert!(fit(&p).is_err());
}
#[test]
fn invalid_data_links_and_bounds_are_rejected() {
    let mut p = project("Singlet", "Lorentzian");
    p.sites[0].params.get_mut("cs").unwrap().link = Some(Link {
        target: "site:0:fwhm".into(),
        factor: 1.,
    });
    p.sites[0].params.get_mut("fwhm").unwrap().link = Some(Link {
        target: "site:0:cs".into(),
        factor: 1.,
    });
    assert!(evaluate(&p).unwrap_err().contains("Circular"));
    let mut p = project("Singlet", "Lorentzian");
    p.sites[0].params.get_mut("fwhm").unwrap().min = Some(0.5);
    assert!(fit(&p).is_err());
    let mut p = project("Singlet", "Lorentzian");
    p.spectrum.x[2] = p.spectrum.x[1];
    assert!(fit(&p).is_err());
}
#[test]
fn transmission_matches_direct_reference_convolution() {
    for squared in [false, true] {
        let mut p = project("Doublet", "Lorentzian");
        p.mode = "transmission".into();
        p.source_squared = squared;
        p.sites[0].params.get_mut("intensity").unwrap().value = 0.1;
        let model = evaluate(&p).unwrap();
        for &i in &[0, 80, 180, 200, 260, 400] {
            let xi = p.spectrum.x[i];
            let center = ((xi + 30.) / 0.01).round() as i64;
            let want = (0..6001)
                .map(|j| {
                    let k = center + 3000 - j;
                    if !(0..6001).contains(&k) {
                        return 0.;
                    }
                    let src = profile(
                        -30. + j as f64 * 0.01,
                        0.,
                        p.source_fwhm,
                        1.,
                        if squared { "LorSquared" } else { "Lorentzian" },
                        0.,
                    );
                    src * (-site_curve(&p.sites[0], -30. + k as f64 * 0.01)).exp()
                })
                .sum::<f64>()
                / 100.
                * 1000.;
            assert!(
                (model.y[i] - want).abs() < 1e-8,
                "{} != {}",
                model.y[i],
                want
            );
        }
    }
}
#[test]
fn transmission_fit_recovers_depth_and_center() {
    let mut p = project("Singlet", "Lorentzian");
    p.mode = "transmission".into();
    p.sites[0].params.get_mut("intensity").unwrap().value = 0.1;
    p.spectrum.y = evaluate(&p).unwrap().y;
    p.sites[0].params.get_mut("intensity").unwrap().value = 0.08;
    p.sites[0].params.get_mut("cs").unwrap().value = 0.18;
    let r = fit(&p).unwrap();
    assert!(r.evaluation.sse < 1e-7, "{}", r.evaluation.sse);
}
#[test]
fn all_fixed_is_a_valid_evaluation() {
    let mut p = project("Doublet", "Lorentzian");
    for par in p.sites[0].params.values_mut() {
        par.fit = false;
    }
    p.background[0].fit = false;
    let r = fit(&p).unwrap();
    assert_eq!(r.iterations, 0);
    assert_eq!(r.free_parameters, 0);
    assert_eq!(r.evaluation.sse, 0.);
    assert_eq!(r.intensity_fractions[0].value, Some(100.));
    assert_eq!(r.intensity_fractions[0].error, Some(0.));
}

#[test]
fn fraction_uncertainty_uses_covariance_and_respects_links_bounds_and_zero_total() {
    let mut p = project("Singlet", "Lorentzian");
    p.sites.push(p.sites[0].clone());
    for site in &mut p.sites {
        for param in site.params.values_mut() {
            param.fit = false;
        }
    }
    p.background[0].fit = false;
    p.sites[0].params.get_mut("intensity").unwrap().value = 30.;
    p.sites[1].params.get_mut("intensity").unwrap().value = 70.;
    for site in &mut p.sites {
        site.params.get_mut("intensity").unwrap().fit = true;
    }
    let m = Prepared::new(&p).unwrap();
    // Physical covariance [[4,3],[3,9]], converted to the optimizer's scaled coordinates.
    let cov = DMatrix::from_row_slice(2, 2, &[4. / 900., 3. / 2100., 3. / 2100., 9. / 4900.]);
    let stats = fraction_statistics(&m, &m.initial, Some(&cov), &[false, false]);
    assert_eq!(stats[0].value, Some(30.));
    let expected = (0.7_f64.powi(2) * 4. + 0.3_f64.powi(2) * 9. - 2. * 0.7 * 0.3 * 3.).sqrt();
    assert!((stats[0].error.unwrap() - expected).abs() < 1e-12);
    assert!((stats[1].error.unwrap() - expected).abs() < 1e-12);
    assert!(
        fraction_statistics(&m, &m.initial, Some(&cov), &[true, false])[0]
            .error
            .is_none()
    );
    assert!(
        fraction_statistics(&m, &m.initial, None, &[false, false])[0]
            .error
            .is_none()
    );
    p.sites[1].params.get_mut("intensity").unwrap().link = Some(Link {
        target: "site:0:intensity".into(),
        factor: 2.,
    });
    let m = Prepared::new(&p).unwrap();
    let stats = fraction_statistics(&m, &m.initial, None, &[true]);
    assert!((stats[0].value.unwrap() - 100. / 3.).abs() < 1e-12);
    assert_eq!(stats[0].error, Some(0.));
    assert_eq!(stats[1].error, Some(0.));
    p.sites[0].params.get_mut("intensity").unwrap().value = 0.;
    let m = Prepared::new(&p).unwrap();
    assert!(fraction_statistics(&m, &m.initial, None, &[])
        .iter()
        .all(|s| s.value.is_none() && s.error.is_none()));
}
#[test]
fn noisy_high_count_spectrum_converges() {
    let mut p = project("Sextet", "Lorentzian");
    p.background[0].value = 100000.;
    p.sites[0].params.get_mut("intensity").unwrap().value = 2400.;
    p.spectrum.y = evaluate(&p)
        .unwrap()
        .y
        .iter()
        .enumerate()
        .map(|(i, y)| y + 9. * (i as f64 * 1.72).sin())
        .collect();
    p.sites[0].params.get_mut("cs").unwrap().value = 0.;
    p.sites[0].params.get_mut("fwhm").unwrap().value = 0.5;
    let r = fit(&p).unwrap();
    assert!(r.converged, "{}", r.termination);
    assert!(r.evaluation.sse < 20000.);
}

#[test]
fn zero_sites_support_background_only_fitting() {
    let mut p = project("Singlet", "Lorentzian");
    p.sites.clear();
    p.spectrum.y = vec![1234.5; p.spectrum.x.len()];
    let e = evaluate(&p).unwrap();
    assert!(e.components.is_empty());
    let r = fit(&p).unwrap();
    assert!(r.converged);
    assert!((r.project.background[0].value - 1234.5).abs() < 1e-8);
    assert_eq!(r.free_parameters, 1);
}
