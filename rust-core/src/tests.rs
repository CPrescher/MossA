use super::*;
// Compile the actual patched solver source and its frozen upstream reference
// against Basin's public Scalar trait, without optional backend/dev dependencies.
use basin::Scalar;
#[path = "../vendor/basin/src/core/math/dense_svd.rs"]
mod dense_svd;
#[path = "../vendor/basin/src/core/math/dense_svd_reference.rs"]
mod dense_svd_reference;
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
            color: None,
            kind: kind.into(),
            profile: shape.into(),
            params,
            xvbf: None,
        }],
        background: vec![par(1000., true)],
        mode: "thin".into(),
        source_fwhm: 0.097,
        source_squared: false,
        source_gaussians: None,
        weighting: "unweighted".into(),
        derivative_method: None,
        thin_solver: None,
        max_iterations: 300,
        nuclear_constants: None,
        search_probe: None,
        search_defer_uncertainties: false,
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
fn prepared_lines_preserve_reference_arithmetic_for_every_profile_and_kind() {
    for kind in ["Singlet", "Doublet", "Sextet"] {
        for shape in ["Lorentzian", "Gaussian", "PseudoVoigt", "LorSquared"] {
            let p = project(kind, shape);
            for coefficients in [
                [0.1613, 0.0934, 0.0255],
                [0.1612785758490726, 0.09338354131598467, 0.02548850678289673],
            ] {
                let curve = SiteCurve::new(&p.sites[0], coefficients);
                for i in 0..6001 {
                    let x = -30. + i as f64 * 0.01;
                    assert_eq!(
                        curve.value(x),
                        site_curve_with_coefficients(&p.sites[0], x, coefficients),
                        "{kind} {shape} at {x}"
                    );
                }
            }
        }
    }
}

#[test]
fn residual_workspace_does_not_leak_between_models_or_fit_callbacks() {
    let mut first = project("Singlet", "Lorentzian");
    first.mode = "transmission".into();
    first.sites[0].params.get_mut("intensity").unwrap().value = 0.3;
    let expected = evaluate(&first).unwrap();
    let mut second = first.clone();
    second.source_squared = true;
    second.sites.clear();
    evaluate(&second).unwrap();
    assert_eq!(evaluate(&first).unwrap().y, expected.y);
    first.spectrum.y = expected.y;
    let reference = first.clone();
    first.sites[0].params.get_mut("cs").unwrap().value += 0.03;
    let fitted = fit_with_progress(
        &first,
        Some(Box::new(move |_| {
            // The shared per-thread scratch borrow must end before callbacks run.
            assert_eq!(evaluate(&reference).unwrap().y, reference.spectrum.y);
        })),
    )
    .unwrap();
    assert!(fitted.converged);
    assert!(fitted.evaluation.sse < 1e-7);
}

#[test]
fn prepared_xvbf_does_not_require_unused_line_width() {
    let mut p = project("Doublet", "Lorentzian");
    p.sites[0].xvbf = Some(Xvbf {
        delta: par(0.3, false),
        cs: vec![DistributionComponent {
            center: par(0.2, true),
            width: par(0.13, true),
            weight: par(1., false),
        }],
        qs: vec![DistributionComponent {
            center: par(1.5, true),
            width: par(0.22, false),
            weight: par(1., false),
        }],
    });
    let expected = evaluate(&p).unwrap().y;
    p.sites[0].params.remove("fwhm");
    assert_eq!(evaluate(&p).unwrap().y, expected);
}
#[test]
fn modern_zeeman_coefficients_reach_thin_and_transmission_models() {
    let mut p = project("Sextet", "Lorentzian");
    p.nuclear_constants = Some(NuclearConstants {
        id: "fe57-iaea-2019-2020-codata2022".into(),
        coefficients: [0.1612785758490726, 0.09338354131598467, 0.02548850678289673],
    });
    p.sites[0].params.get_mut("qs").unwrap().value = 0.;
    p.sites[0].params.get_mut("intensity").unwrap().value = 0.3;
    p.sites[0].params.get_mut("a12").unwrap().value = 1.5;
    p.sites[0].params.get_mut("a13").unwrap().value = 3.;
    let k = 1000. * 299792458. * 5.0507837393e-27 / (14412.497 * 1.602176634e-19);
    let mut transitions = vec![];
    for mg in [-0.5_f64, 0.5] {
        for me in [-1.5_f64, -0.5, 0.5, 1.5] {
            if (me - mg).abs() > 1. {
                continue;
            }
            let coefficient = k * (-(-0.15531 / 1.5) * me + (0.09064 / 0.5) * mg);
            let weight = if me.abs() == 1.5 {
                3.
            } else if me == mg {
                2.
            } else {
                1.
            };
            transitions.push((coefficient, weight));
        }
    }
    // Independent Lorentzian expression, not site_curve or the registry.
    let absorption = |v: f64| {
        transitions
            .iter()
            .map(|(coefficient, weight)| {
                0.3 * weight / 12. * 0.21
                    / PI
                    / ((v - 0.23 - 31.2 * coefficient).powi(2) + 0.21_f64.powi(2))
            })
            .sum::<f64>()
    };
    let thin = evaluate(&p).unwrap();
    for (i, &v) in p.spectrum.x.iter().enumerate() {
        assert!((thin.y[i] - (1000. - absorption(v))).abs() < 1e-11);
    }
    p.mode = "transmission".into();
    for squared in [false, true] {
        p.source_squared = squared;
        let model = evaluate(&p).unwrap();
        for &i in &[80, 180, 200, 260] {
            let center = ((p.spectrum.x[i] + 30.) / 0.01).round() as i64;
            let want = (0..6001)
                .map(|j| {
                    let index = center + 3000 - j;
                    if !(0..6001).contains(&index) {
                        return 0.;
                    }
                    let source = profile(
                        -30. + j as f64 * 0.01,
                        0.,
                        p.source_fwhm,
                        1.,
                        if squared { "LorSquared" } else { "Lorentzian" },
                        0.,
                    );
                    source * (-absorption(-30. + index as f64 * 0.01)).exp()
                })
                .sum::<f64>()
                * 10.;
            assert!(
                (model.y[i] - want).abs() < 1e-8,
                "{squared}: {} != {want}",
                model.y[i]
            );
        }
    }
    let mut bad = p.clone();
    bad.nuclear_constants.as_mut().unwrap().coefficients[0] = 0.1613;
    assert!(evaluate(&bad).is_err());
    bad.nuclear_constants.as_mut().unwrap().id = "unknown".into();
    assert!(evaluate(&bad).is_err());
    let mut json = serde_json::to_value(&p).unwrap();
    json["nuclear_constants"] = serde_json::Value::Null;
    assert!(serde_json::from_value::<Project>(json).is_err());
    let legacy = project("Sextet", "Lorentzian");
    let json = serde_json::to_value(&legacy).unwrap();
    assert!(
        json.get("nuclear_constants").is_none(),
        "do not change old model hashes"
    );
    assert_eq!(
        evaluate(&serde_json::from_value(json).unwrap()).unwrap().y,
        evaluate(&legacy).unwrap().y
    );
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
            // At the floating-point floor, the joint and projected solvers can
            // return different stopping codes for noiseless data. Keep every
            // parameter-recovery assertion and the tighter residual requirement
            // for numerical no-progress/failure stops. Raw fit status is retained.
            assert!(
                r.converged
                    || (matches!(
                        r.termination.as_str(),
                        "NumericalNoProgress" | "SolverFailed"
                    ) && r.evaluation.sse < 1e-12),
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

#[test]
fn xvbf_simplex_enforces_physical_bounds_and_fixed_weights_on_all_trials() {
    let mut p = project("Doublet", "Lorentzian");
    for value in p.sites[0].params.values_mut() {
        value.fit = false;
    }
    p.background[0].fit = false;
    let component = |center, weight, free, lower, upper| DistributionComponent {
        center: par(center, false),
        width: par(0.2, false),
        weight: Parameter {
            value: weight,
            fit: free,
            min: Some(lower),
            max: Some(upper),
            link: None,
        },
    };
    p.sites[0].xvbf = Some(Xvbf {
        delta: par(0.3, false),
        cs: vec![component(0.2, 1., false, 0., 1.)],
        qs: vec![
            component(0.8, 0.1, true, 0.1, 0.3),
            component(1.5, 0.25, true, 0.1, 0.4),
            component(2.3, 0.25, true, 0.1, 0.4),
            component(3., 0.4, false, 0., 1.),
        ],
    });
    let model = Prepared::new(&p).unwrap();
    assert_eq!(model.free.len(), 2);
    for a in [0., 0.25, 0.5, 0.75, 1.] {
        for b in [0., 0.25, 0.5, 0.75, 1.] {
            let trial = model.expand(&[a, b]);
            let qs = &trial.sites[0].xvbf.as_ref().unwrap().qs;
            assert!((qs.iter().map(|c| c.weight.value).sum::<f64>() - 1.).abs() < 1e-14);
            assert_eq!(qs[3].weight.value, 0.4);
            for c in qs {
                assert!(
                    c.weight.value >= c.weight.min.unwrap() - 1e-14
                        && c.weight.value <= c.weight.max.unwrap() + 1e-14
                );
            }
            assert!(evaluate_prepared(&model, &[a, b])
                .y
                .iter()
                .all(|v| v.is_finite()));
        }
    }
}

#[test]
fn site_color_survives_fitting_without_changing_the_scientific_model() {
    let mut p = project("Doublet", "Lorentzian");
    let plain = fit(&p).unwrap();
    p.sites[0].color = Some("#6633aa".into());
    let colored = fit(&p).unwrap();
    assert_eq!(colored.project.sites[0].color.as_deref(), Some("#6633aa"));
    assert_eq!(colored.evaluation.y, plain.evaluation.y);
    assert_eq!(colored.errors, plain.errors);
}

// A five-point stencil provides an independent derivative check with lower
// truncation error than the production central-difference fallback.
fn check_exact_jacobian(p: &Project) {
    let mut p = p.clone();
    p.derivative_method = Some(DerivativeMethod::Analytical);
    let m = Prepared::new(&p).unwrap();
    let x = &m.initial;
    let exact = m
        .analytical_derivative(x)
        .expect("supported analytical model");
    for k in 0..x.len() {
        let h = 2e-5 * x[k].abs().max(1.);
        let residuals: Vec<_> = [-2., -1., 1., 2.]
            .iter()
            .map(|f| {
                let mut point = x.clone();
                point[k] += f * h;
                m.residuals(&point)
            })
            .collect();
        for row in 0..exact.nrows() {
            let numerical = (residuals[0][row] - 8. * residuals[1][row] + 8. * residuals[2][row]
                - residuals[3][row])
                / (12. * h);
            assert!(
                (exact[(row, k)] - numerical).abs() < 3e-7 * exact[(row, k)].abs().max(1.),
                "{} {} k={k} row={row}: exact={} reference={numerical}",
                p.sites[0].kind,
                p.sites[0].profile,
                exact[(row, k)]
            );
        }
    }
    assert_eq!(m.derivative(x), exact);
}
#[test]
fn analytical_thin_jacobians_match_independent_five_point_reference() {
    for kind in ["Singlet", "Doublet", "Sextet"] {
        for shape in ["Lorentzian", "Gaussian", "PseudoVoigt", "LorSquared"] {
            for counts in [false, true] {
                let mut p = project(kind, shape);
                for param in p.sites[0].params.values_mut() {
                    param.fit = true;
                }
                if counts {
                    p.weighting = "counts".into();
                    p.spectrum.y.iter_mut().for_each(|y| *y = y.abs().max(100.));
                }
                p.background
                    .extend([par(0.3, true), par(0.02, true), par(-0.001, true)]);
                check_exact_jacobian(&p);
                // Zero absorption still has a nonzero area derivative.
                p.sites[0].params.get_mut("intensity").unwrap().value = 0.;
                check_exact_jacobian(&p);
            }
        }
    }
}
#[test]
fn analytical_chain_rule_handles_linked_roots_bounds_and_nuclear_constants() {
    for modern in [false, true] {
        let mut p = project("Sextet", "PseudoVoigt");
        // Use the alternative convention through the same validated definition
        // used by the nuclear-constant reference test below.
        if modern {
            p.nuclear_constants = Some(NuclearConstants {
                id: "fe57-iaea-2019-2020-codata2022".into(),
                coefficients: [0.1612785758490726, 0.09338354131598467, 0.02548850678289673],
            });
        }
        let mut second = project("Doublet", "Gaussian").sites.remove(0);
        second.params.get_mut("cs").unwrap().link = Some(Link {
            target: "site:0:cs".into(),
            factor: -0.5,
        });
        second.params.get_mut("intensity").unwrap().link = Some(Link {
            target: "site:0:intensity".into(),
            factor: 0.7,
        });
        second.params.get_mut("fwhm").unwrap().link = Some(Link {
            target: "site:0:fwhm".into(),
            factor: 1.5,
        });
        p.sites.push(second);
        p.sites[0].params.get_mut("cs").unwrap().min = Some(-1.);
        p.sites[0].params.get_mut("cs").unwrap().max = Some(1.);
        p.background.push(par(0.01, true));
        p.sites[0].params.get_mut("qs").unwrap().link = Some(Link {
            target: "bkg:1".into(),
            factor: 2.,
        });
        check_exact_jacobian(&p);
    }
}
#[test]
fn explicit_numerical_override_covers_xvbf_and_source_calibration() {
    let fixtures: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/transmission-performance.json"
    ))
    .unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let mut p: Project = serde_json::from_value(case["project"].clone()).unwrap();
        let calibration = case["calibration"] == true;
        if !calibration && p.sites.iter().all(|s| s.xvbf.is_none()) {
            continue;
        }
        let automatic = Prepared::with_source_calibration(&p, calibration).unwrap();
        assert!(automatic.uses_analytical_derivatives());
        p.derivative_method = Some(DerivativeMethod::Numerical);
        let numeric = Prepared::with_source_calibration(&p, calibration).unwrap();
        assert!(!numeric.uses_analytical_derivatives());
        assert!(numeric.analytical_derivative(&numeric.initial).is_none());
        for k in 0..numeric.free.len() {
            assert_eq!(
                numeric.derivative(&numeric.initial).column(k).as_slice(),
                numeric.derivative_column(&numeric.initial, k)
            );
        }
    }
}

#[test]
fn analytical_coincident_sextet_jacobians_match_five_point_reference() {
    let mut p = project("Sextet", "Lorentzian");
    p.background[0].value = 2e6;
    p.spectrum.y.fill(2e6);
    p.sites = vec![p.sites[0].clone(); 3];
    for (site, (field, area)) in
        p.sites
            .iter_mut()
            .zip([(50., 82203.), (45., 41412.), (50., 37045.)])
    {
        for (key, value) in [
            ("cs", 0.5),
            ("qs", 0.),
            ("bhf", field),
            ("intensity", area),
            ("fwhm", 0.35),
        ] {
            site.params.get_mut(key).unwrap().value = value;
        }
    }
    p.derivative_method = Some(DerivativeMethod::Analytical);
    let m = Prepared::new(&p).unwrap();
    let x = &m.initial;
    let j = m.derivative(x);
    for k in 0..x.len() {
        let h = 1e-5 * x[k].abs().max(1.);
        let r: Vec<_> = [-2., -1., 1., 2.]
            .iter()
            .map(|f| {
                let mut z = x.clone();
                z[k] += f * h;
                m.residuals(&z)
            })
            .collect();
        let norm = j.column(k).norm().max(1.);
        let difference = (0..j.nrows())
            .map(|i| {
                ((r[0][i] - 8. * r[1][i] + 8. * r[2][i] - r[3][i]) / (12. * h) - j[(i, k)]).powi(2)
            })
            .sum::<f64>()
            .sqrt();
        assert!(
            difference / norm < 1e-7,
            "column {k}: relative error {}",
            difference / norm
        );
    }
}
#[test]
fn analytical_covariance_and_fraction_std_match_numerical_at_identical_points() {
    for shape in ["Lorentzian", "Gaussian", "PseudoVoigt", "LorSquared"] {
        let mut p = project("Sextet", shape);
        p.spectrum
            .y
            .iter_mut()
            .enumerate()
            .for_each(|(i, y)| *y += 0.3 * (i as f64 * 1.72).sin());
        let second = project("Doublet", "Gaussian").sites.remove(0);
        p.sites.push(second);
        p.sites[1].params.get_mut("fwhm").unwrap().link = Some(Link {
            target: "site:0:fwhm".into(),
            factor: 1.3,
        });
        p.derivative_method = Some(DerivativeMethod::Numerical);
        let m = Prepared::new(&p).unwrap();
        let numerical = finish_fit(&m, m.initial.clone(), 0, true, "Test".into()).unwrap();
        p.derivative_method = Some(DerivativeMethod::Analytical);
        let m = Prepared::new(&p).unwrap();
        let exact = finish_fit(&m, m.initial.clone(), 0, true, "Test".into()).unwrap();
        assert_eq!(exact.rank, numerical.rank);
        assert_eq!(exact.warnings, numerical.warnings);
        for (key, std) in numerical.errors {
            match (std, exact.errors[&key]) {
                (Some(a), Some(b)) => assert!(
                    (a - b).abs() < 1e-10 + 1e-4 * a,
                    "{shape} {key}: {a} vs {b}"
                ),
                (None, None) => {}
                _ => panic!("{shape} {key}: changed std availability"),
            }
        }
        for (a, b) in numerical
            .intensity_fractions
            .iter()
            .zip(exact.intensity_fractions)
        {
            assert_eq!(a.value, b.value);
            match (a.error, b.error) {
                (Some(a), Some(b)) => assert!((a - b).abs() < 1e-10 + 1e-4 * a),
                (None, None) => {}
                _ => panic!("changed fraction std availability"),
            }
        }
    }
}

#[test]
fn default_thin_derivatives_are_analytical_and_numerical_is_an_exact_override() {
    let p = project("Doublet", "PseudoVoigt");
    let automatic = Prepared::new(&p).unwrap();
    assert!(automatic.uses_analytical_derivatives());
    assert_eq!(
        automatic.derivative(&automatic.initial),
        automatic.analytical_derivative(&automatic.initial).unwrap()
    );
    let mut numeric = p.clone();
    numeric.derivative_method = Some(DerivativeMethod::Numerical);
    let m = Prepared::new(&numeric).unwrap();
    assert!(!m.uses_analytical_derivatives());
    for k in 0..m.free.len() {
        assert_eq!(
            m.derivative(&m.initial).column(k).as_slice(),
            m.derivative_column(&m.initial, k)
        );
    }
}
#[test]
fn coincident_starts_separate_deterministically_without_changing_evaluation_or_scales() {
    for kind in ["Singlet", "Doublet", "Sextet"] {
        for shape in ["Lorentzian", "Gaussian", "PseudoVoigt", "LorSquared"] {
            let mut p = project(kind, shape);
            p.sites.push(p.sites[0].clone());
            p.sites[1].params.get_mut("intensity").unwrap().value *= 0.4;
            let original = serde_json::to_string(&p).unwrap();
            let m = Prepared::new(&p).unwrap();
            let original_y = m.residuals(&m.initial);
            let (x, adjusted) = m.starting_point();
            assert!(!adjusted.is_empty(), "{kind}/{shape}");
            assert_ne!(x, m.initial);
            assert_eq!(m.starting_point().0, x);
            assert_eq!(serde_json::to_string(&p).unwrap(), original);
            assert_eq!(m.residuals(&m.initial), original_y);
            let split = m.expand(&x);
            let key = if kind == "Sextet" { "bhf" } else { "cs" };
            assert!((get(&split.sites[0], key) - get(&split.sites[1], key)).abs() > 0.1);
            let weighted = (get(&split.sites[0], key) + 0.4 * get(&split.sites[1], key)) / 1.4;
            assert!((weighted - get(&p.sites[0], key)).abs() < 1e-12);
            for (k, &v) in x.iter().enumerate() {
                assert!(v >= m.lower[k] && v <= m.upper[k]);
            }
            p.derivative_method = Some(DerivativeMethod::Numerical);
            let numeric = Prepared::new(&p).unwrap();
            assert_eq!(numeric.starting_point(), (numeric.initial.clone(), vec![]));
        }
    }
}
#[test]
fn coincident_starts_respect_common_bounds_fixed_shapes_and_shared_links() {
    let mut p = project("Singlet", "Lorentzian");
    p.sites = vec![p.sites[0].clone(); 4];
    for site in &mut p.sites {
        let cs = site.params.get_mut("cs").unwrap();
        cs.min = Some(0.);
        cs.max = Some(cs.value);
    }
    let m = Prepared::new(&p).unwrap();
    let (x, _) = m.starting_point();
    let split = m.expand(&x);
    for (i, s) in split.sites.iter().enumerate() {
        let cs = get(s, "cs");
        assert!((0. ..=0.23).contains(&cs));
        for t in &split.sites[..i] {
            assert_ne!(cs, get(t, "cs"));
        }
    }
    for site in &mut p.sites {
        for (key, param) in &mut site.params {
            param.fit = key == "intensity";
        }
    }
    let m = Prepared::new(&p).unwrap();
    assert_eq!(m.starting_point().0, m.initial);
    // Shared geometry is an intentional constraint; independent widths may
    // still separate the components without modifying either shared root.
    for site in &mut p.sites {
        site.params.get_mut("fwhm").unwrap().fit = true;
        site.params.get_mut("cs").unwrap().fit = true;
    }
    for i in 1..p.sites.len() {
        p.sites[i].params.get_mut("cs").unwrap().link = Some(Link {
            target: "site:0:cs".into(),
            factor: 1.,
        });
    }
    let m = Prepared::new(&p).unwrap();
    let (x, adjusted) = m.starting_point();
    let split = m.expand(&x);
    assert!(adjusted.iter().all(|id| id.ends_with(":fwhm")));
    assert!(!adjusted.is_empty());
    for site in &split.sites {
        assert_eq!(get(site, "cs"), 0.23);
    }
}
#[test]
fn distinct_and_unsupported_starts_are_unchanged_and_unidentifiable_std_stays_unavailable() {
    let mut p = project("Doublet", "Lorentzian");
    p.sites.push(p.sites[0].clone());
    p.sites[1].params.get_mut("cs").unwrap().value += 1e-4;
    let m = Prepared::new(&p).unwrap();
    assert_eq!(m.starting_point().0, m.initial);
    p.sites[1].params.get_mut("cs").unwrap().value = get(&p.sites[0], "cs");
    for site in &mut p.sites {
        for (key, param) in &mut site.params {
            param.fit = key == "intensity";
        }
    }
    let r = fit(&p).unwrap();
    assert!(r.rank < r.free_parameters);
    assert!(r.errors["site:0:intensity"].is_none());
    assert!(r.errors["site:1:intensity"].is_none());
    p.mode = "transmission".into();
    let m = Prepared::new(&p).unwrap();
    assert_eq!(m.starting_point().0, m.initial);
}
#[test]
fn coincident_exact_fits_are_not_disturbed_and_short_fits_retain_the_input_objective_floor() {
    let mut p = project("Singlet", "Lorentzian");
    p.sites.push(p.sites[0].clone());
    p.spectrum.y = evaluate(&p).unwrap().y;
    let m = Prepared::new(&p).unwrap();
    assert_eq!(m.starting_point(), (m.initial.clone(), vec![]));
    assert!(fit(&p).unwrap().evaluation.objective < 1e-20);
    p.spectrum
        .y
        .iter_mut()
        .enumerate()
        .for_each(|(i, y)| *y += 0.001 * (i as f64 * 1.7).sin());
    p.max_iterations = 1;
    let m = Prepared::new(&p).unwrap();
    let (x, adjusted) = m.starting_point();
    assert!(!adjusted.is_empty());
    let state = m.retain_starting_incumbent(FitState {
        x,
        iterations: 1,
        converged: true,
        termination: "RelativeCostTolerance".into(),
        source_calibration: false,
    });
    assert_eq!(state.x, m.initial);
    assert!(!state.converged);
    assert_eq!(state.termination, "StartingModelRetained");
    let r = fit(&p).unwrap();
    assert!(r.evaluation.objective <= evaluate(&p).unwrap().objective);
}

fn check_transmission_jacobian(p: &Project) {
    let m = Prepared::new(p).unwrap();
    let x = &m.initial;
    let exact = m
        .analytical_derivative(x)
        .expect("supported transmission model");
    for k in 0..x.len() {
        let h = 1e-5 * x[k].abs().max(1.);
        let values: Vec<_> = [-2., -1., 1., 2.]
            .iter()
            .map(|f| {
                let mut point = x.clone();
                point[k] += f * h;
                m.residuals(&point)
            })
            .collect();
        let difference = (0..exact.nrows())
            .map(|i| {
                let numeric = (values[0][i] - 8. * values[1][i] + 8. * values[2][i] - values[3][i])
                    / (12. * h);
                (numeric - exact[(i, k)]).powi(2)
            })
            .sum::<f64>()
            .sqrt();
        let norm = exact.column(k).norm().max(1.);
        let scale = p
            .spectrum
            .y
            .iter()
            .map(|y| {
                if p.weighting == "counts" {
                    y.sqrt()
                } else {
                    y.abs()
                }
            })
            .fold(1., f64::max);
        let roundoff = 64. * f64::EPSILON * scale * (exact.nrows() as f64).sqrt() / h;
        assert!(
            difference < 5e-7 * norm + roundoff,
            "{} {} k={k}: relative difference {}, roundoff {roundoff}",
            p.sites[0].kind,
            p.sites[0].profile,
            difference / norm
        );
    }
}
#[test]
fn analytical_transmission_chain_rule_matches_independent_five_point_derivatives() {
    for kind in ["Singlet", "Doublet", "Sextet"] {
        for shape in ["Lorentzian", "Gaussian", "PseudoVoigt", "LorSquared"] {
            for source in 0..3 {
                let mut p = project(kind, shape);
                p.mode = "transmission".into();
                p.background = [par(20000., true), par(-0.2, true), par(0.01, true)].to_vec();
                p.spectrum.x = (0..81).map(|i| -9.013 + i as f64 * 0.225).collect();
                p.spectrum.y = vec![20000.; 81];
                p.sites[0].params.get_mut("intensity").unwrap().value = 0.6;
                for param in p.sites[0].params.values_mut() {
                    param.fit = true;
                }
                if source == 1 {
                    p.source_squared = true;
                }
                if source == 2 {
                    p.source_gaussians = Some(vec![
                        SourceGaussian {
                            center: -0.13,
                            fwhm: 0.21,
                            weight: 1.,
                        },
                        SourceGaussian {
                            center: 0.3,
                            fwhm: 0.37,
                            weight: 0.3,
                        },
                    ]);
                    p.weighting = "counts".into();
                }
                check_transmission_jacobian(&p);
            }
        }
    }
}
#[test]
fn analytical_transmission_jacobians_cover_existing_off_grid_models_and_links() {
    let fixtures: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/transmission-performance.json"
    ))
    .unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let p: Project = serde_json::from_value(case["project"].clone()).unwrap();
        if p.mode != "transmission"
            || case["calibration"] == true
            || p.sites.iter().any(|s| s.xvbf.is_some())
        {
            continue;
        }
        check_transmission_jacobian(&p);
    }
}
#[test]
fn transmission_snapshot_is_keyed_by_coordinates_and_shared_only_by_model_clones() {
    let mut p = project("Doublet", "PseudoVoigt");
    p.mode = "transmission".into();
    p.sites[0].params.get_mut("intensity").unwrap().value = 0.6;
    p.spectrum.y.fill(10000.);
    p.background[0].value = 10000.;
    let m = Prepared::new(&p).unwrap();
    let j = m.analytical_derivative(&m.initial).unwrap();
    let clone = m.clone();
    assert!(Arc::ptr_eq(
        &m.transmission_snapshot,
        &clone.transmission_snapshot
    ));
    let mut shifted = m.initial.clone();
    shifted[1] += 0.01;
    let _ = clone.residuals(&shifted);
    assert_eq!(m.analytical_derivative(&m.initial).unwrap(), j);
    p.source_squared = true;
    let other = Prepared::new(&p).unwrap();
    assert!(!Arc::ptr_eq(
        &m.transmission_snapshot,
        &other.transmission_snapshot
    ));
    let _ = other.residuals(&other.initial);
    assert_eq!(m.analytical_derivative(&m.initial).unwrap(), j);
}
#[test]
fn transmission_chain_rule_handles_background_cross_links_zero_area_and_other_constants() {
    let mut p = project("Sextet", "PseudoVoigt");
    p.mode = "transmission".into();
    p.background = [par(20000., true), par(0.3, true)].to_vec();
    p.spectrum.y.fill(20000.);
    p.sites[0].params.get_mut("intensity").unwrap().value = 0.6;
    p.sites[0].params.get_mut("cs").unwrap().link = Some(Link {
        target: "bkg:1".into(),
        factor: -0.5,
    });
    p.nuclear_constants = Some(NuclearConstants {
        id: "fe57-iaea-2019-2020-codata2022".into(),
        coefficients: [0.1612785758490726, 0.09338354131598467, 0.02548850678289673],
    });
    check_transmission_jacobian(&p);
    p.sites[0].params.get_mut("intensity").unwrap().value = 0.;
    check_transmission_jacobian(&p);
}
#[test]
fn transmission_derivatives_cover_interpolation_edges_and_saturation() {
    let mut p = project("Singlet", "Lorentzian");
    p.mode = "transmission".into();
    p.background[0].value = 20000.;
    p.spectrum.x = vec![
        -30., -29.999, -29.993, -29.99, -0.2637, 0.2637, 29.99, 29.993, 29.999, 30.,
    ];
    p.spectrum.y = vec![20000.; p.spectrum.x.len()];
    for intensity in [0.6, 12.] {
        p.sites[0].params.get_mut("intensity").unwrap().value = intensity;
        check_transmission_jacobian(&p);
    }
}

fn check_extended_jacobian(p: &Project, calibration: bool) {
    let m = Prepared::with_source_calibration(p, calibration).unwrap();
    let x = &m.initial;
    let j = m.analytical_derivative(x).expect("analytical derivative");
    for k in 0..x.len() {
        if j.column(k).as_slice() == m.derivative_column(x, k) {
            continue;
        }
        let norm = j.column(k).norm().max(1.);
        let mut passed = false;
        let mut diagnostics = Vec::new();
        // A five-point stencil can cross a PCHIP branch even when the smaller
        // production step does not. Verify a more local stencil in that case.
        for step in [1e-5, 1e-6] {
            let h = step * x[k].abs().max(1.);
            let r: Vec<_> = [-2., -1., 1., 2.]
                .iter()
                .map(|f| {
                    let mut z = x.clone();
                    z[k] += f * h;
                    m.residuals(&z)
                })
                .collect();
            let err = (0..j.nrows())
                .map(|i| {
                    let d = (r[0][i] - 8. * r[1][i] + 8. * r[2][i] - r[3][i]) / (12. * h);
                    (d - j[(i, k)]).powi(2)
                })
                .sum::<f64>()
                .sqrt();
            let scale = p
                .spectrum
                .y
                .iter()
                .map(|v| {
                    if p.weighting == "counts" {
                        v.sqrt()
                    } else {
                        v.abs()
                    }
                })
                .fold(1., f64::max);
            let floor = 64. * f64::EPSILON * scale * (j.nrows() as f64).sqrt() / h;
            diagnostics.push((step, err / norm, floor));
            if err < 1e-6 * norm + floor {
                passed = true;
                break;
            }
        }
        assert!(
            passed,
            "calibration={calibration} {} {diagnostics:?}",
            m.entries[m.free[k]].id
        );
    }
}

#[test]
fn extended_source_jacobians_match_five_point_derivatives() {
    let f: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/transmission-performance.json"
    ))
    .unwrap();
    for name in [
        "source-calibration-lorentzian",
        "source-calibration-squared",
    ] {
        let p: Project = serde_json::from_value(
            f["cases"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == name)
                .unwrap()["project"]
                .clone(),
        )
        .unwrap();
        check_extended_jacobian(&p, true);
        let mut p = p;
        p.source_gaussians = Some(vec![
            SourceGaussian {
                center: -0.1,
                fwhm: 0.21,
                weight: 1.,
            },
            SourceGaussian {
                center: 0.34,
                fwhm: 0.37,
                weight: 0.28,
            },
            SourceGaussian {
                center: -0.4,
                fwhm: 0.43,
                weight: 0.15,
            },
        ]);
        check_extended_jacobian(&p, true);
    }
}
#[test]
fn extended_xvbf_jacobians_match_five_point_derivatives() {
    let f: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/transmission-performance.json"
    ))
    .unwrap();
    let base: Project = serde_json::from_value(
        f["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == "xvbf-transmission")
            .unwrap()["project"]
            .clone(),
    )
    .unwrap();
    for mode in ["thin", "transmission"] {
        for delta in [-0.6, 0., 0.6] {
            let mut p = base.clone();
            p.mode = mode.into();
            let d = p.sites[0].xvbf.as_mut().unwrap();
            d.delta.value = delta;
            d.delta.fit = true;
            d.cs.push(d.cs[0].clone());
            d.cs[1].center.value = -0.5;
            d.cs[1].width.value = 0.08;
            d.qs.push(d.qs[0].clone());
            d.qs[1].center.value = 2.2;
            d.qs[1].width.value = 0.17;
            for list in [&mut d.cs, &mut d.qs] {
                for (i, c) in list.iter_mut().enumerate() {
                    c.weight = par(if i == 0 { 0.65 } else { 0.35 }, true);
                    c.width.fit = true;
                    c.center.fit = true;
                }
            }
            check_extended_jacobian(&p, false);
        }
    }
}
#[test]
fn extended_source_normalization_ties_use_bounded_numerical_columns() {
    let f: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/transmission-performance.json"
    ))
    .unwrap();
    let mut p: Project = serde_json::from_value(
        f["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == "source-calibration-lorentzian")
            .unwrap()["project"]
            .clone(),
    )
    .unwrap();
    p.sites[0].params.get_mut("cs").unwrap().value = 0.;
    p.spectrum.x = (0..81).map(|i| (i as f64 - 40.) * 0.0675).collect();
    p.spectrum.y = vec![20000.; 81];
    let m = Prepared::with_source_calibration(&p, true).unwrap();
    let j = m.analytical_derivative(&m.initial).unwrap();
    let k = m
        .free
        .iter()
        .position(|&i| m.entries[i].key == "cs")
        .unwrap();
    assert_eq!(j.column(k).as_slice(), m.derivative_column(&m.initial, k));
}
#[test]
fn extended_xvbf_limits_and_bounded_weight_chain_rule_remain_exact() {
    let f: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/transmission-performance.json"
    ))
    .unwrap();
    let base: Project = serde_json::from_value(
        f["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == "xvbf-transmission")
            .unwrap()["project"]
            .clone(),
    )
    .unwrap();
    for delta in [-1., 1.] {
        let mut p = base.clone();
        let d = p.sites[0].xvbf.as_mut().unwrap();
        d.delta.value = delta;
        d.delta.fit = true;
        d.cs[0].width.value = 0.11;
        d.qs[0].width.value = 0.22;
        let m = Prepared::new(&p).unwrap();
        let j = m.analytical_derivative(&m.initial).unwrap();
        for key in ["delta", "csd:0:width"] {
            let k = m
                .free
                .iter()
                .position(|&i| m.entries[i].key == key)
                .unwrap();
            assert_eq!(j.column(k).as_slice(), m.derivative_column(&m.initial, k));
        }
    }
    let mut p = base;
    let d = p.sites[0].xvbf.as_mut().unwrap();
    d.cs = vec![d.cs[0].clone(); 3];
    for (i, c) in d.cs.iter_mut().enumerate() {
        c.center.value = i as f64 * 0.7;
        c.weight = par([0.3, 0.4, 0.3][i], true);
        c.weight.min = Some(0.1);
        c.weight.max = Some([0.5, 0.7, 0.8][i]);
    }
    check_extended_jacobian(&p, false);
    let m = Prepared::new(&p).unwrap();
    let (maps, _) = m.parameter_maps(&m.initial);
    for group in &m.simplexes {
        for k in 0..m.free.len() {
            let sum = group
                .indices
                .iter()
                .map(|&i| {
                    maps[i]
                        .iter()
                        .filter(|&&(j, _)| j == k)
                        .map(|&(_, v)| v)
                        .sum::<f64>()
                })
                .sum::<f64>();
            assert!(sum.abs() < 1e-14);
        }
    }
    p.sites[0].xvbf.as_mut().unwrap().cs[1].weight.max = Some(0.6);
    let m = Prepared::new(&p).unwrap();
    let (_, fallback) = m.parameter_maps(&m.initial);
    assert!(fallback.iter().any(|&v| v));
    let j = m.analytical_derivative(&m.initial).unwrap();
    for (k, &use_numeric) in fallback.iter().enumerate() {
        if use_numeric {
            assert_eq!(j.column(k).as_slice(), m.derivative_column(&m.initial, k));
        }
    }
}
#[test]
fn extended_source_joint_kernel_absorber_and_background_links_match_derivatives() {
    let f: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/transmission-performance.json"
    ))
    .unwrap();
    let mut p: Project = serde_json::from_value(
        f["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == "source-calibration-lorentzian")
            .unwrap()["project"]
            .clone(),
    )
    .unwrap();
    p.sites[0].params.get_mut("intensity").unwrap().link = Some(Link {
        target: "source:fwhm".into(),
        factor: 0.8,
    });
    p.background[1].link = Some(Link {
        target: "source:fwhm".into(),
        factor: -0.5,
    });
    check_extended_jacobian(&p, true);
    p.source_gaussians = Some(vec![
        SourceGaussian {
            center: 0.,
            fwhm: 0.21,
            weight: 1.,
        },
        SourceGaussian {
            center: 0.34,
            fwhm: 0.37,
            weight: 0.28,
        },
    ]);
    p.sites[0].params.get_mut("intensity").unwrap().link = Some(Link {
        target: "source:1:fwhm".into(),
        factor: 0.8,
    });
    p.sites[0].params.get_mut("cs").unwrap().link = Some(Link {
        target: "source:1:center".into(),
        factor: 0.5,
    });
    p.background[1].link = None;
    check_extended_jacobian(&p, true);
}

#[test]
fn shared_profile_evaluation_preserves_forward_values_and_invalidates_by_coordinates() {
    let fixtures: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/transmission-performance.json"
    ))
    .unwrap();
    let base: Project = serde_json::from_value(
        fixtures["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == "xvbf-transmission")
            .unwrap()["project"]
            .clone(),
    )
    .unwrap();
    for mode in ["thin", "transmission"] {
        for delta in [-1., -0.4, 0., 0.4, 1.] {
            let mut p = base.clone();
            p.mode = mode.into();
            let d = p.sites[0].xvbf.as_mut().unwrap();
            d.delta.value = delta;
            d.cs.push(d.cs[0].clone());
            d.cs[1].center.value += 0.7;
            d.cs[1].width.value = 0.19;
            for (i, c) in d.cs.iter_mut().enumerate() {
                c.weight = par(if i == 0 { 0.6 } else { 0.4 }, true);
            }
            let m = Prepared::new(&p).unwrap();
            let x = m.initial.clone();
            let shared = m.model_curves_shared(&x, false, true).0;
            let joint = if mode == "thin" {
                m.absorber_snapshot
                    .lock()
                    .unwrap()
                    .as_ref()
                    .unwrap()
                    .1
                    .clone()
            } else {
                m.transmission_snapshot
                    .lock()
                    .unwrap()
                    .as_ref()
                    .unwrap()
                    .optical_jac
                    .clone()
                    .unwrap()
            };
            assert_eq!(shared, m.model_curves_shared(&x, false, false).0);
            // Refill the joint snapshot after the independent forward call.
            m.model_curves_shared(&x, false, true);
            let j = m.derivative(&x);
            let clone = m.clone();
            assert!(Arc::ptr_eq(
                &m.transmission_snapshot,
                &clone.transmission_snapshot
            ));
            assert!(Arc::ptr_eq(&m.absorber_snapshot, &clone.absorber_snapshot));
            let mut other = x.clone();
            other[0] += 0.013;
            clone.model_curves_shared(&other, false, true);
            let again = m.derivative(&x);
            assert!((&j - &again).norm() <= 1e-12 * j.norm().max(1.));
            assert_eq!(
                joint.values.len(),
                if mode == "thin" {
                    p.spectrum.x.len()
                } else {
                    6001
                }
            );
            assert!(joint.values.iter().all(|v| v.is_finite()));
        }
    }
}

#[test]
fn real_transmission_fft_matches_full_complex_transform_and_normalization() {
    let mut workspace = TransmissionWorkspace::new();
    for case in 0..4 {
        let values: Vec<_> = (0..6001)
            .map(|i| match case {
                0 => {
                    if i == 3000 {
                        1.
                    } else {
                        0.
                    }
                }
                1 => 1.,
                2 => {
                    if i % 2 == 0 {
                        1.
                    } else {
                        -1.
                    }
                }
                _ => (i as f64 * 0.013).sin() + 0.3 * (i as f64 * 0.37).cos(),
            })
            .collect();
        workspace.forward_signal(values.iter().copied(), false);
        let full = workspace.spectrum(false).to_vec();
        workspace.forward_signal(values.iter().copied(), true);
        let half = workspace.spectrum(true);
        assert_eq!(half.len(), TRANSMISSION_FFT_LEN / 2 + 1);
        assert_eq!(half[0].im, 0.);
        assert_eq!(half[TRANSMISSION_FFT_LEN / 2].im, 0.);
        for (a, b) in half.iter().zip(&full) {
            assert!((*a - *b).norm() <= 2e-12 * full[0].norm().max(6001.));
        }
        let real = workspace.inverse_signal(true).to_vec();
        let complex = workspace.inverse_signal(false);
        for (i, (&a, &b)) in real.iter().zip(complex).enumerate() {
            let a = a / TRANSMISSION_FFT_LEN as f64;
            let b = b / TRANSMISSION_FFT_LEN as f64;
            assert!((a - b).abs() <= 2e-12);
            assert!((a - values.get(i).copied().unwrap_or(0.)).abs() <= 2e-12);
        }
    }
}
