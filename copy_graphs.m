function copy_graphs(handle_origin, handle_new)


line_handles=get(handle_origin,'children');
num_handles=length(line_handles);

red=0; gr=0.4; blue=0;
for k=1:num_handles
   red=red+0.05;gr=gr+0.15;blue=blue+0.4;
   if red>1
       red=red-1;
   end
   if gr>1
       gr=gr-1;
   end
   if blue>1
       blue=blue-1;
   end
   colors(k,:)=[red gr blue]; 
end



for i=1:num_handles
    maxima(i)=max(get(line_handles(i),'ydata'));  
end
[~,order]=sort(maxima);

for i=1:num_handles
    xdata=get(line_handles(order(i)),'xdata');
    ydata=get(line_handles(order(i)),'ydata');
    area(handle_new, xdata, ydata, 0, 'FaceColor', colors(i,:), 'EraseMode','xor'); 
    hold on;
end
hold off;