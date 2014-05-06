function y=FT_lor2(cs,hwhm_a,ta,hwhm_s,x)
    range=max(x)-min(x);
    x_test=linspace(-range,+range,1000);
    
    y1=lorentz_curve(0,hwhm_s,1,x_test).^2;
    y2=exp(-ta*lorentz_curve(cs,hwhm_a,1,x_test));
    
    y=convn(y1,y2,'same');
    y=interp1(x_test, y,x);
    y=1-y./max(y);
end