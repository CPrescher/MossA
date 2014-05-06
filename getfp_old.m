function [pfp, output] = getfp(data)

num=24;


for n=1:num
    res=[];
    res=zeros(512,1);
    fp=length(data)/2-6+n*0.5;
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
[m,n]=max(output.y);
pfp=output.x(n);

