function plot_all(data,graph)
    site=getappdata(0,'site_data');
    site_cur=getappdata(0,'site_cur');
    site_num=getappdata(0,'site_num');
    
    plot(graph,data.x,data.y,'k.');
    hold on;
    I0=getappdata(0,'I0');
%     all=getappdata(0,'I0');
    order=getappdata(0,'bkg_order');
    param=getappdata(0,'bkg_param');
    all=getappdata(0,'I0');
    for k=2:order
        all=all-param(k)*data.x.^(k-1); 
    end
    
    plot(data.x, all, 'b-');
    
    ft_fit=getappdata(0,'ft_fit');
    if ~ft_fit
        %for normal plotting of all data
        for k=1:site_num
            y_site=site(k).calc(data.x);
            all=all-y_site;
            y=I0-y_site;
            if k~=site_cur
                plot(graph, data.x, y, 'b-');
            else
                plot(graph,data.x, y, 'r--');
            end
        end
        if site_num>0
            plot(graph, data.x, all, 'g-');
        end
    else
        ft_factor=getappdata(0,'ft_factor');
        for k=1:site_num
            y_site=ft_factor*site(k).calc(data.x);
            all=all-y_site;
            y=I0-y_site;
            if k~=site_cur
                plot(graph, data.x, y, 'b-');
            else
                plot(graph,data.x, y, 'r--');
            end
        end
        ft_y=getappdata(0,'ft_y');
        if length(ft_y)>0
            plot(graph, data.x, ft_y, 'g-');
        end
    end
    set(graph, 'YLim', data.YLim*1.003);
    set(graph, 'XLim', data.XLim); 
    hold off;
end
