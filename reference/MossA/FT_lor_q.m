function y=FT_lor_q(cs,hwhm_a,intensity,qs,hwhm_s,x,varargin)
    range=max(x)-min(x);
    x_test=linspace(-20,20,12000);
    y1=lorentz_curve(0,hwhm_s,1,x_test);
    
    if length(varargin)==1
        a12=varargin{1}(1);
    else
        a12=0.5;
    end
    int1=a12*intensity;
    int2=(1-a12)*intensity;
    
    y2=exp(-intensity*(lorentz_curve(cs-qs/2,hwhm_a,int1,x_test)+lorentz_curve(cs+qs/2,hwhm_a,int2,x_test)));
    
    y=convn(y1,y2,'same');
    y=spline(x_test, y,x);
    y=1-y./max(y);
end