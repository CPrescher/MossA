classdef coptions < handle
    properties
        panH;
        
        solverChooser; errorChooser;
        
        saveProjectBtn; loadProjectBtn;
        
        solutionListbox; saveSolutionBtn; delSolutionBtn;
        solutionNameTxt;
    end
    methods
        function obj=coptions(panH)
            obj.panH=panH;
            uicontrol(panH, 'Style', 'text', 'String', 'Solver:',...
                'Position', [15 410 40 15],'horizontalalignment', 'right');
            obj.solverChooser=uicontrol(panH, 'style', 'popupmenu',...
                'String', {'lsqcurvefit', 'fmincon'},...
                'Position', [63 413 90 17], 'backgroundcolor', [1 1 1],...
                'callback', @obj.solverChooser_click);
            setappdata(0,'solver','lsqcurvefit');
            
            uicontrol(panH, 'Style', 'text', 'String', 'Errors:',...
                'Position', [15 380 40 15],'horizontalalignment', 'right');
            obj.errorChooser=uicontrol(panH, 'style', 'popupmenu',...
                'String', {'1-sigma', '2-sigma'},'value',2,...
                'Position', [63 383 90 17], 'backgroundcolor', [1 1 1],...
                'callback', @obj.errorChooser_click);
            setappdata(0,'error','2sigma');
            
% %             obj.saveProjectBtn=uicontrol(panH, 'style', 'pushbutton',...
% %                 'string', 'Save Project', 'Position', [05 330 80 30],...
% %                 'callback', @obj.saveProjectBtnClick);            
% %             obj.loadProjectBtn=uicontrol(panH, 'style', 'pushbutton',...
% %                 'string', 'Load Project', 'Position', [100 330 80 30],...
% %                 'callback', @obj.loadProjectBtnClick);          
% %             
% %             obj.solutionListbox=uicontrol(panH, 'style', 'listbox',...
% %                 'string', {'current solution'}, 'Position', [05 230 175 80],...
% %                 'backgroundcolor', [1 1 1],...
% %                 'value', 1, 'callback', @obj.solutionListboxClick);
% %             obj.solutionNameTxt=uicontrol(panH, 'Style', 'edit','Horizontalalignment','left',...
% %                 'backgroundcolor', [1 1 1], 'string','', 'Position', [05 210 175 17]);
% %             
% %             obj.saveSolutionBtn=uicontrol(panH, 'style', 'pushbutton',...
% %                 'string', 'Save Solution', 'Position', [05 175 80 30],...
% %                 'callback', @obj.saveSolutionBtnClick);
% %             obj.delSolutionBtn=uicontrol(panH, 'style', 'pushbutton',...
% %                 'string', 'Delete Solution', 'Position', [100 175 80 30],...
% %                 'callback', @obj.delSolutionBtnClick);
        end        
        
        function solverChooser_click(~,hObject,~)
           if get(hObject,'value')==1
               setappdata(0,'solver','lsqcurvefit');
           else
               setappdata(0,'solver','fmincon');
           end            
        end
        function errorChooser_click(~,hObject,~)
           if get(hObject,'value')==1
               setappdata(0,'error','1sigma');
           else
               setappdata(0,'error','2sigma');
           end            
        end
        
%         function saveProjectBtnClick(~,~,~)
%             newProject=cMaProject();
%             newProject.saveProject();            
%         end
%         function loadProjectBtnClick(~,~,~)
%             newProject=cMaProject();
%             newProject.loadProject();   
%         end
%         
%         function solutionListboxClick(obj, hObject,~)
%         end
%         function saveSolutionBtnClick(obj,~,~)
%             
%             %add the entry in the solutionlistbox
%             name=get(obj.solutionNameTxt,'String');
%             if ~strcmp(name,'')
%                solutions=get(obj.solutionListbox,'String');
%                solutions{length(solutions)+1}=name;
%                set(obj.solutionListbox,'string',solutions);
%             end
%         end
%         function delSolutionBtnClick(obj,~,~)
%         end
    end
end