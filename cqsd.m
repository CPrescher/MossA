classdef cqsd < handle
    
    properties
        pan_h
        %interface variables:
        convert_cb;
        site_num_txt; site_num_cnt; add_btn; del_btn;
        site_c_pan;
        
        site_pan;
        pi_txt; qs_txt; fwhm_txt; delta1_txt;
        pi_cb; qs_cb; fwhm_cb; delta1_cb;
        
        data_axes; arr_left_btn; arr_right_btn;
        save_pan;
        save_graph_btn;    save_data_btn; 
        save_sites_btn;        
    end
    
    methods
        function obj=cqsd(pan_h)
            obj.pan_h=pan_h;
            obj.convert_cb=uicontrol(pan_h, 'style','checkbox', 'String',...
                'convert','Value',0,'Position', [15 420 90 15], 'callback',...
                @obj.convert_cb_click,'enable','off');
            
            %*************************************************************
            %********************site_control_pan*************************
            %*************************************************************
            obj.site_c_pan=uipanel('Parent',pan_h,'units','pixel','Position',...
                [05 385 185 30],'Userdata','panel');
            obj.site_num_txt=uicontrol(obj.site_c_pan, 'Style', 'edit','Horizontalalignment','right',...
                'backgroundcolor', [1 1 1], 'string','1', 'Position', [10 05 20 17],...
                'enable','inactive');
            obj.site_num_cnt=uicontrol(obj.site_c_pan, 'style','slider', 'Max', 10, 'Min',1,...
                'value', 1,'SliderStep',[0.05 0.2],'position',[33 05 13 17],...
                'callback', @obj.site_num_cnt_click, 'enable', 'inactive');
            add_btn=uicontrol(obj.site_c_pan, 'style', 'Pushbutton', 'String', '+',...
                'Position', [70 05 40 20], 'callback', @obj.add_btn_click, 'enable', 'off');
            del_btn=uicontrol(obj.site_c_pan,'style', 'pushbutton', 'string', '-',...
                'Position', [120 05 40 20], 'callback', @obj.del_btn_click, 'enable', 'off');
            
            %*************************************************************
            %***********************site_param_pan************************
            %*************************************************************
            
            obj.site_pan=uipanel('Parent',pan_h,'units','pixel','Position',...
                [05 280 185 95],'title', 'Params','Userdata','panel');
            
            uicontrol(obj.site_pan, 'Style', 'text', 'String', 'delta 1:',...
                'Position', [30 05 35 15],'horizontalalignment', 'right',...
                'enable', 'off');
            obj.delta1_txt=uicontrol(obj.site_pan,'style','edit', 'string','',...
                'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
                'Position', [80 05 70 17], 'callback', @obj.value_cb,...
                'UserData', 'delta1', 'enable', 'off');
            obj.delta1_cb=uicontrol(obj.site_pan,'style', 'checkbox', 'String','',...
                 'Value', 1, 'Position',[160 07 15 15],'enable', 'off','UserData', 'fit(3)',...
                 'callback', @obj.cb_click);
            
            uicontrol(obj.site_pan, 'Style', 'text', 'String', 'FWHM:',...
                'Position', [30 25 35 15],'horizontalalignment', 'right');
            obj.fwhm_txt=uicontrol(obj.site_pan,'style','edit', 'string','',...
                'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
                'Position', [80 25 70 17], 'callback', @obj.value_cb,... 
                'enable', 'off','UserData', 'fwhm');
            obj.fwhm_cb=uicontrol(obj.site_pan,'style', 'checkbox', 'String','',...
                'Value', 1, 'Position',[160 25 15 15],'callback',...
                @obj.cb_click, 'enable', 'off','UserData', 'fit(2)');

            uicontrol(obj.site_pan, 'Style', 'text', 'String', 'QS:',...
                'Position', [30 45 35 15],'horizontalalignment', 'right');
            obj.qs_txt=uicontrol(obj.site_pan,'style','edit', 'string','',...
                'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
                'Position', [80 45 70 17], 'callback', @obj.value_cb,...
                'enable', 'off','UserData', 'qs');
            obj.qs_cb=uicontrol(obj.site_pan,'style', 'checkbox', 'String','',...
                'Value', 1, 'Position',[160 45 15 15],...
                'callback', @obj.cb_click, 'enable', 'off','UserData', 'fit(1)');
            
            uicontrol(obj.site_pan, 'Style', 'text', 'String', 'P_i:',...
                'Position', [30 65 35 15],'horizontalalignment', 'right');
            obj.pi_txt=uicontrol(obj.site_pan,'style','edit', 'string','',...
                'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
                'Position', [80 65 70 17], 'callback', @obj.value_cb,...
                'enable', 'off', 'UserData', 'p_i');
%             obj.pi_cb=uicontrol(obj.site_pan,'style', 'checkbox', 'String','',...
%                 'Value', 1, 'Position',[160 65 15 15],...
%                 'callback', @cb_click, 'enable', 'off','UserData', 'fit(3)');
            
            %*************************************************************
            %***********************everything else***********************
            %*************************************************************
            obj.data_axes=axes('parent', pan_h, 'units','pixel',...
                'Position',[05 130 180 140],'UserData','axes','YTick',zeros(1,0));
%             obj.arr_left_btn=uicontrol(pan_h, 'style', 'Pushbutton',...
%                 'String', '<', 'Position', [10 90 80 15],...
%                 'callback', @arr_left_btn_click, 'enable', 'off');
%             
%             obj.arr_right_btn=uicontrol(pan_h, 'style', 'Pushbutton',...
%                 'String', '>', 'Position', [105 90 80 15],...
%                 'callback', @arr_right_btn_click, 'enable', 'off');
            
            obj.save_pan=uipanel('Parent',pan_h,'units','pixel','Position',...
                [05 05 185 70],'Userdata','panel');
            
            obj.save_graph_btn=uicontrol(obj.save_pan, 'style', 'Pushbutton',...
                'String', 'Save Graph', 'Position', [05 35 80 25],...
                'callback', @obj.save_graph_btn_click, 'enable', 'off');
            obj.save_data_btn=uicontrol(obj.save_pan, 'style', 'Pushbutton',...
                'String', 'Save Data', 'Position', [95 35 80 25],...
                'callback', @obj.save_data_btn_click, 'enable', 'off');
            obj.save_sites_btn=uicontrol(obj.save_pan, 'style', 'Pushbutton',...
                'String', 'Save Sites', 'Position', [05 5 80 25],...
                'callback', @obj.save_sites_btn_click, 'enable', 'off');
           
        end
        
        %******************************************************************
        %********************callbacks*************************************
        %******************************************************************
        
        function qsd_on(obj)
            h1=findobj('UserData', 'fit(4)');
            h2=findobj('UserData', 'qs');
            h3=findobj('UserData', 'fit(3)');
            h4=findobj('UserData', 'fit(2)');
            h5=findobj('UserData', 'fwhm');
            h6=findobj('UserData', 'fit(5)');
            
            qsd_h1=findobj('parent',obj.site_c_pan);
            qsd_h2=findobj('parent',obj.site_pan);  
            qsd_h3=findobj('parent',obj.save_pan);  
            
            %first disable the qs controls on the left side
            set(h1,'enable', 'off'); 
            set(h2,'enable', 'off');
            set(h3,'enable', 'off');
            set(h4,'enable', 'off');
            set(h5,'enable', 'off');
            set(h5,'String', '0.194');
            set(h6,'enable', 'off');
            
            %enable all the qsd interface controls
            set(qsd_h1,'enable','on');
            set(qsd_h2,'enable','on');
            set(qsd_h3,'enable', 'on');
            
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            
            if site(site_cur).qsd_site_num<=1
               set(obj.site_num_cnt, 'Enable','inactive'); 
            end
            
            xmax=0;
            for k=1:site(site_cur).qsd_site_num
               set(site(site_cur).qsd_site(k).line_h,'visible','on');
               xmax=max([xmax;...
                   site(site_cur).qsd_site(k).qs+3*site(site_cur).qsd_site(k).fwhm]);
            end
            fitting=getappdata(0,'fitting_data');
            if ~strcmp(fitting.state,'define_qsd2');
                
                xrange = [0 xmax];
                x=0:0.01:xmax;                
                for k=1:site(site_cur).qsd_site_num
                    y=site(site_cur).qsd_site(k).calc(x);
                    set(site(site_cur).qsd_site(k).line_h,'xdata',x);
                    set(site(site_cur).qsd_site(k).line_h,'ydata',y);
                end
                set(obj.data_axes,'xlim', xrange);
            end
            set(obj.save_graph_btn,'enable','on');
        end
        
        function qsd_off(obj)
            h1=findobj('UserData', 'fit(4)');
            h2=findobj('UserData', 'qs');
            h3=findobj('UserData', 'fit(3)');
            h4=findobj('UserData', 'fit(2)');
            h5=findobj('UserData', 'fwhm');
            h6=findobj('UserData', 'fit(5)');
            
            qsd_h1=findobj('parent',obj.site_c_pan);
            qsd_h2=findobj('parent',obj.site_pan);
            qsd_h3=findobj('parent',obj.save_pan); 
            
            %enable the qs controls on the left side
            set(h1,'enable', 'on'); 
            set(h2,'enable', 'on'); 
            set(h3,'enable', 'on');
            set(h4,'enable', 'on');
            set(h5,'enable', 'on');
            set(h6,'enable', 'on');
            %disable all the qsd interface controls
            set(qsd_h1,'enable','off');
            set(qsd_h2,'enable','off');
            set(qsd_h3,'enable', 'off');
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            site_num=getappdata(0,'site_num');
            
            if site_num~=0
                for n=1:site_num
                    for k=1:site(n).qsd_site_num                    
                       set(site(n).qsd_site(k).line_h,'visible','off');
                    end
                end
            end
            setappdata(0,'site_data',site);
            set(obj.save_graph_btn,'enable','off');
            
        end
        function convert_cb_click(obj, hObject, ~)
            val=get(hObject,'value');   
            if val
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');
                site(site_cur).fit_method=1;
                
                %initiate the site:
                if site(site_cur).qsd_site_num==0
                    site(site_cur).qsd_site_num=1;
                    site(site_cur).qsd_site=cqsd_site(1,site(site_cur).qs,0.2);
                    xmax = site(site_cur).qs+3*site(site_cur).qsd_site(1).fwhm;
                    xrange = [0 xmax];
                    x=0:0.01:xmax;
                    y=site(site_cur).qsd_site(1).calc(x);
                    site(site_cur).qsd_site(1).line_h=plot(obj.data_axes,x,y);
                    set(obj.data_axes,'xlim', xrange);
                end
                
                setappdata(0,'site_data',site);
                obj.update_txt();
            else
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');
                site(site_cur).fit_method=0;
                setappdata(0,'site_data',site);
                obj.update_txt();
            end
        end
        
        function add_btn_click(obj,~,~)
            fitting = getappdata(0,'fitting_data');
            if strcmp(fitting.state,'normal')
                fitting.state='define_qsd1';
                setappdata(0,'fitting_data',fitting);
                
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');
                
                site(site_cur).qsd_site_num=site(site_cur).qsd_site_num+1;
                site(site_cur).qsd_site_cur=site(site_cur).qsd_site_num;
                site(site_cur).qsd_site(site(site_cur).qsd_site_num)=cqsd_site(1,2,0.2);
                
                %define initial values
                set(obj.data_axes,'NextPlot','add');
                xlimits=get(obj.data_axes,'xlim');
                xdata=0:0.01:xlimits(2);
                clear ydata;
                ydata(1:length(xdata))=NaN;
                
                
                site(site_cur).qsd_site(site(site_cur).qsd_site_num).line_h=...
                    plot(obj.data_axes,xdata,ydata,'r-');
                
                %vertical line
                qsd_ver_h=plot(obj.data_axes, [0 0], [NaN NaN],'r--');
                qsd_hor_h=plot(obj.data_axes, [min(xdata) max(xdata)], [NaN NaN],'r--');


                setappdata(0,'qsd_ver_h',qsd_ver_h);
                setappdata(0,'qsd_hor_h',qsd_hor_h);
                
                setappdata(0,'site_data', site);
                obj.update_txt();

                %define the slider things
                set(obj.site_num_txt, 'String', site(site_cur).qsd_site_num);
                
                if site(site_cur).qsd_site_num>=2
                    set(obj.site_num_cnt, 'Enable','on');
                    set(obj.site_num_cnt, 'Max', site(site_cur).qsd_site_num);
                    set(obj.site_num_cnt, 'Min', 1);
                    set(obj.site_num_cnt, 'Value' , site(site_cur).qsd_site_num);
                    set(obj.site_num_cnt, 'SliderStep', [1/(site(site_cur).qsd_site_num-1) 5]);
                    for k=1:site(site_cur).qsd_site_num-1
                       set(site(site_cur).qsd_site(k).line_h,'color','b'); 
                    end
                else
                   set(obj.site_num_cnt, 'Enable','inactive'); 
                end
            end      
        end
        
        function del_btn_click(obj,~,~)
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            qsd_site_cur=site(site_cur).qsd_site_cur;
            qsd_site_old=site(site_cur).qsd_site;
            qsd_site_num=site(site_cur).qsd_site_num;
            counter=0;

            if qsd_site_num>0
                site(site_cur).qsd_site(qsd_site_cur).delete_h();
            end

            %saving the con matrix of the deleted site:
            if qsd_site_num>1
                for k=1:qsd_site_num
                    if k~=qsd_site_cur
                        counter=counter+1;
                        qsd_site_new(counter)=qsd_site_old(k);
                    end
                end
                site(site_cur).qsd_site=qsd_site_new;
                qsd_site_num=qsd_site_num-1;
            else
                qsd_site_num=0;
            end
            
            %slider mist:
            if qsd_site_cur>1
                qsd_site_cur=qsd_site_cur-1;
            else
                qsd_site_cur=1;
                %reset the textboxes
                if qsd_site_num>=1

                else
                    set(obj.qs_txt,'String','');
                    set(obj.fwhm_txt,'String','');
                    set(obj.pi_txt,'String','');
                    set(obj.delta1_txt,'String','');
                end
            end

            set(obj.site_num_txt, 'String', qsd_site_cur);
            set(obj.site_num_cnt, 'Value', qsd_site_cur);
            
            if qsd_site_num>1
                set(obj.site_num_cnt, 'Enable','on');
                if qsd_site_num>=2
                  set(obj.site_num_cnt, 'SliderStep', [1/(qsd_site_num-1) 5]); 
                  set(obj.site_num_cnt, 'Max', qsd_site_num);
                end

            else
                set(obj.site_num_cnt, 'Enable','inactive'); 
                set(obj.site_num_cnt, 'Max', 1');
                set(obj.site_num_txt, 'String', 1);
            end
            if qsd_site_num>0
                set(site(site_cur).qsd_site(qsd_site_cur).line_h,'color','r');
            end
            
            site(site_cur).qsd_site_cur=qsd_site_cur;
            site(site_cur).qsd_site_num=qsd_site_num;
            site(site_cur)=site(site_cur).recalculate_pi();
            setappdata(0,'site_data', site);
            site(site_cur).update_h();
            obj.update_txt();             
        end
        
        function site_num_cnt_click(obj,hObject, ~)
            set(obj.site_num_txt,'String', get(hObject, 'Value'));
            qsd_site_cur=get(hObject, 'Value');
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            site(site_cur).qsd_site_cur=get(hObject,'value');

            for k=1:site(site_cur).qsd_site_num
                if k==qsd_site_cur
                    set(site(site_cur).qsd_site(k).line_h,'color','r');
                else
                    set(site(site_cur).qsd_site(k).line_h,'color','b');
                end   
            end               
            setappdata(0,'site_data',site);
            obj.update_txt();
        end
        
        function value_cb(obj, hObject, ~)
            str=get(hObject,'string');
            str=strrep(str,',','.');
            var=str2double(str);
            if isnan(var)
                beep;
                set(hObject,'String', '');
            else
                set(hObject,'String',var);
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');
                qsd_site_cur=site(site_cur).qsd_site_cur;
                if ~strcmp(get(hObject, 'UserData'),'delta1')
                    str=['site(site_cur).qsd_site(qsd_site_cur).',...
                        get(hObject, 'UserData'),'=str2double(get(hObject,''String''));'];
                    eval(str);
                else
                    site(site_cur).delta1=str2double(get(hObject,'String'));
                end
                site(site_cur)=site(site_cur).recalculate_pi();
                setappdata(0,'site_data',site);
                site(site_cur).update_h();
                site(site_cur).qsd_site(qsd_site_cur).update_h();
                obj.update_txt();
            end                
        end    
        
        function update_txt(obj)
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            site_num=getappdata(0,'site_num');
            if site(site_cur).fit_method==1 && site_num>0
                obj.qsd_on();
                qsd_site_cur=site(site_cur).qsd_site_cur;
                set(obj.convert_cb,'value',1);
                set(obj.pi_txt,'string',site(site_cur).qsd_site(qsd_site_cur).p_i);
                set(obj.fwhm_txt,'string',site(site_cur).qsd_site(qsd_site_cur).fwhm);
                set(obj.qs_txt,'string',site(site_cur).qsd_site(qsd_site_cur).qs);
                set(obj.delta1_txt,'string',site(site_cur).delta1);
                for n=1:site_num
                   if n==site_cur
                      for k=1:site(site_cur).qsd_site_num
                         set(site(site_cur).qsd_site(k).line_h,'visible','on'); 
                      end
                   else
                      for k=1:site(n).qsd_site_num
                         set(site(n).qsd_site(k).line_h,'visible','off'); 
                      end 
                   end
                end
            else
                obj.qsd_off();
                set(obj.convert_cb,'value',0);
                set(obj.pi_txt,'string','');
                set(obj.fwhm_txt,'string','');
                set(obj.qs_txt,'string','');
                set(obj.delta1_txt,'string','');
            end                
        end
        
        function cb_click(obj,hObject, ~)
            old_value=get(hObject, 'Value');
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            qsd_site_cur=site(site_cur).qsd_site_cur;
            str=['site(site_cur).qsd_site(qsd_site_cur).',get(hObject, 'UserData'),'=old_value;'];
            eval(str);
            setappdata(0,'site_data', site);
            obj.update_txt();
        end
        
        
        function save_graph_btn_click(obj,~,~)
            set(gcf,'Renderer','OpenGL')
            out_fig=figure;
            test=axes('parent',out_fig);
            copy_graphs(obj.data_axes,test);
            set(test,'YTick',zeros(1,0));
        end
        
        function save_data_btn_click(obj,~,~)
            work_path=getappdata(0,'work_path');
            if length(work_path)==0
                work_path=pwd;
            end
            old_folder=cd(work_path);
            [file,path] = uiputfile({'*.txt'},...
                'Save data of the graph window');
            if path
                lh=findall(obj.data_axes,'type','line');
                data.x=get(lh,'xdata');
                data.y=get(lh,'ydata');
                if ~iscell(data.x)
                   mat(:,1)=data.x;
                   mat(:,2)=data.y;
                else
                  l=zeros(length(data.x),1);
                  for n=1:length(data.x)
                    l(n)=length(data.x{n});
                  end
                  mat=ones(max(l),2);
                  for n=1:length(data.x)
                    mat(1:l(n),2*n-1)=data.x{n};
                    mat(1:l(n),2*n)=data.y{n};
                  end
                end
                dlmwrite([path, file], mat,'delimiter', '\t');
                fclose('all');
            end  
            cd(old_folder);
        end
        
        function save_sites_btn_click(~,~,~)
            work_path=getappdata(0,'work_path');
        
            if length(work_path)==0
                work_path=pwd;
            end
            old_folder=cd(work_path);
            [file,path] = uiputfile({'*.txt'},...
                'Save fitted Site parameter');
            if path
                setappdata(0,'work_path', path);    
                output(1,:)= {'site', 'pi','error','QS', 'error',...
                    'FWHM','error', 'delta1', 'error'};
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');
                qsd_site_num=site(site_cur).qsd_site_num;

                for k=1:qsd_site_num
                   output(k+1,:)={k, ...
                       site(site_cur).qsd_site(k).p_i, site(site_cur).qsd_site(k).p_i_error,...
                       site(site_cur).qsd_site(k).qs, site(site_cur).qsd_site(k).qs_error,...
                       site(site_cur).qsd_site(k).fwhm, site(site_cur).qsd_site(k).fwhm_error,...
                       site(site_cur).delta1, site(site_cur).delta1_error};
                end   
                dlmcell([path,file],output,';'); 
            end 
            cd(old_folder);
        end
    end
    
end

