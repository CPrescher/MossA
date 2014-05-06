function output = fold(data,fp)

res=[];
if mod(fp,1)==.5
    fp1=floor(fp);
    for k=1:length(data)/2
       x1=fp1+1-k;
       x2=fp1+k;
       if x1<1
           x1=length(data)+x1;
       end
       if x2>length(data)
           x2=x2-length(data);
       end
       res(0+k)=data(x1)+data(x2); 
    end
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
       res(1+k)=data(x1)+data(x2); 
    end
    res(1)=data(fp)*2;
end

output=res;

