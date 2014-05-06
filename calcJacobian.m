function out=calcJacobian(fun, x, xdata)
    h=0.000001;
    jacobi=ones(length(xdata),length(x));
    x1=x;
    x2=x;
    
    for k=1:length(x)
       h=0.1*x1(k);
       x1(k)=x1(k)+h;
       x2(k)=x2(k)-h;
       jacobi(:,k)=(fun(x1, xdata)-fun(x2, xdata))./(2*h);
       x1=x;
       x2=x;
    end
    
    
    out=jacobi;    
end