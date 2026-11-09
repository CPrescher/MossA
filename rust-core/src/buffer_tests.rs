use super::*;
#[test]
fn reusable_evaluation_buffers_overwrite_shapes_values_and_previous_models() {
    let fixtures: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/transmission-performance.json"
    ))
    .unwrap();
    let mut residual = Vec::with_capacity(20000);
    let mut jacobian = DenseMatrix::from_row_slice(1, 1, &[f64::NAN]);
    for c in fixtures["cases"].as_array().unwrap() {
        let p: Project = serde_json::from_value(c["project"].clone()).unwrap();
        let m = Prepared::with_source_calibration(&p, c["calibration"] == true).unwrap();
        for k in [0, 1, 0] {
            let mut x = m.initial.clone();
            if k == 1 && !x.is_empty() {
                x[0] = (x[0] + 0.001).min(m.upper[0]).max(m.lower[0]);
            }
            residual.resize(17000, f64::NAN);
            let pointer = residual.as_ptr();
            let expected = m.residual_and_jacobian(&x).unwrap();
            m.residual_and_jacobian_into(&x, &mut residual, &mut jacobian)
                .unwrap();
            assert_eq!(
                residual.as_ptr(),
                pointer,
                "residual storage should be retained"
            );
            assert_eq!(residual, expected.0);
            assert_eq!(jacobian, expected.1);
        }
    }
}
#[test]
fn projected_and_joint_callbacks_reuse_complete_or_reduced_output_shapes() {
    let fixtures: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/transmission-performance.json"
    ))
    .unwrap();
    let mut p: Project = serde_json::from_value(
        fixtures["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == "thin-control")
            .unwrap()["project"]
            .clone(),
    )
    .unwrap();
    let mut r = Vec::with_capacity(20000);
    let mut j = DenseMatrix::from_row_slice(2, 3, &[f64::NAN; 6]);
    for solver in [
        None,
        Some(ThinSolver::Joint),
        Some(ThinSolver::VariableProjection),
    ] {
        p.thin_solver = solver;
        let model = Prepared::new(&p).unwrap();
        let problem = FitProblem::new(&model, false);
        let x = problem.initial();
        let expected = problem.residual_and_jacobian(&x).unwrap();
        let pointer = r.as_ptr();
        problem
            .residual_and_jacobian_into(&x, &mut r, &mut j)
            .unwrap();
        assert_eq!(pointer, r.as_ptr());
        assert_eq!(r, expected.0);
        assert_eq!(j, expected.1);
    }
}

#[test]
fn qr_eligibility_retains_numerical_and_coupled_distribution_reference_paths() {
    let f: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/solver-qr-mixed-distribution.json"
    ))
    .unwrap();
    let mut p: Project = serde_json::from_value(f["project"].clone()).unwrap();
    assert!(!Prepared::new(&p).unwrap().uses_qr_compression());
    p.sites.retain(|s| s.xvbf.is_some());
    assert!(Prepared::new(&p).unwrap().uses_qr_compression());
    p.derivative_method = Some(DerivativeMethod::Numerical);
    assert!(!Prepared::new(&p).unwrap().uses_qr_compression());
}
