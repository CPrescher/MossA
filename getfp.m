function [pfp, output] = getfp(data)

num=24;


disp(data)
disp(data(1:10))

for n=1:num
    res=[];
    res=zeros(512,1);
    fp=length(data)/2-num/4+n*0.5;
    if mod(fp,1)==.5
        fp1=floor(fp);
        for k=1:(length(data)/2)
           x1=fp1+1-k;
           x2=fp1+k;
           if x1<1
               x1=length(data)+x1;
           end
           if x2>length(data)
               x2=x2-length(data);
           end
           res(0+k)=data(x2)-data(x1);
        end
        %res(1)=0;
    else
        for k=1:(length(data)/2-1)
           x1=fp-k;
           x2=fp+k;
           if x1<1
               x1=length(data)+x1;
           end
           if x2>length(data)
               x2=x2-length(data);
           end
           res(1+k)=data(x1)-data(x2); 
        end
        %res(1)=0;
    end
    output.y(n)=sum(res.^2);
    output.x(n)=fp;
end

maximum=max(output.y);
output.y=100-output.y./maximum.*100;
[~,n]=max(output.y);
fp=output.x(n);
%estimation of folding point by gaussian fit


model=@(x,xdata)(x(1)+gauss_curve(x(2),x(3),x(4),xdata));

ival = [0,    fp,    8,   max(output.y)*(pi*4) ];
lb   = [-inf, fp-10, 0,   0                    ];
ub   = [inf,  fp+10, inf, inf                  ];

param=lsqcurvefit(model,ival,output.x,output.y,lb,ub);

pfp.bkg=param(1);
pfp.center=param(2);
pfp.fwhm=param(3);
pfp.intensity=param(4);
