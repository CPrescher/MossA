function varargout = folding(varargin)
% FOLDING M-file for folding.fig
%      FOLDING, by itself, creates a new FOLDING or raises the existing
%      singleton*.
%
%      H = FOLDING returns the handle to a new FOLDING or the handle to
%      the existing singleton*.
%
%      FOLDING('CALLBACK',hObject,eventData,handles,...) calls the local
%      function named CALLBACK in FOLDING.M with the given input arguments.
%
%      FOLDING('Property','Value',...) creates a new FOLDING or raises the
%      existing singleton*.  Starting from the left, property value pairs are
%      applied to the GUI before folding_OpeningFcn gets called.  An
%      unrecognized property name or invalid value makes property application
%      stop.  All inputs are passed to folding_OpeningFcn via varargin.
%
%      *See GUI Options on GUIDE's Tools menu.  Choose "GUI allows only one
%      instance to run (singleton)".
%
% See also: GUIDE, GUIDATA, GUIHANDLES

% Edit the above text to modify the response to help folding

% Last Modified by GUIDE v2.5 29-May-2012 17:51:27

% Begin initialization code - DO NOT EDIT
gui_Singleton = 1;
gui_State = struct('gui_Name',       mfilename, ...
                   'gui_Singleton',  gui_Singleton, ...
                   'gui_OpeningFcn', @folding_OpeningFcn, ...
                   'gui_OutputFcn',  @folding_OutputFcn, ...
                   'gui_LayoutFcn',  [] , ...
                   'gui_Callback',   []);
if nargin && ischar(varargin{1})
    gui_State.gui_Callback = str2func(varargin{1});
end

if nargout
    [varargout{1:nargout}] = gui_mainfcn(gui_State, varargin{:});
else
    gui_mainfcn(gui_State, varargin{:});
end
% End initialization code - DO NOT EDIT


% --- Executes just before folding is made visible.
function folding_OpeningFcn(hObject, eventdata, handles, varargin)
% This function has no output args, see OutputFcn.
% hObject    handle to figure
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)
% varargin   command line arguments to folding (see VARARGIN)



%first plot the original data:

handles.y=varargin{1};
plot(handles.axes1,handles.y,'.');
fold_data(handles);


% Choose default command line output for folding
handles.output = hObject;

% Update handles structure
guidata(hObject, handles);

% UIWAIT makes folding wait for user response (see UIRESUME)
uiwait(handles.figure1);


% --- Outputs from this function are returned to the command line.
function varargout = folding_OutputFcn(hObject, eventdata, handles) 
% varargout  cell array for returning output args (see VARARGOUT);
% hObject    handle to figure
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)

% Get default command line output from handles structure
varargout{1} = getappdata(0,'fdata');



function fp_txt_Callback(hObject, eventdata, handles)
% hObject    handle to fp_txt (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)

% Hints: get(hObject,'String') returns contents of fp_txt as text
%        str2double(get(hObject,'String')) returns contents of fp_txt as a double
str=get(hObject,'string');
str=strrep(str,',','.');
var=str2double(str);
if isnan(var)
    beep;
    set(hObject,'String', '');
else
    max=length(handles.y);
    var=round(var*2)/2;
    if var>max
        var=max;
    elseif var<0.5
        var=0.5;
    end
    set(hObject,'String',var);
end                


% --- Executes during object creation, after setting all properties.
function fp_txt_CreateFcn(hObject, eventdata, handles)
% hObject    handle to fp_txt (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    empty - handles not created until after all CreateFcns called

% Hint: edit controls usually have a white background on Windows.
%       See ISPC and COMPUTER.
if ispc && isequal(get(hObject,'BackgroundColor'), get(0,'defaultUicontrolBackgroundColor'))
    set(hObject,'BackgroundColor','white');
end


% --- Executes on button press in fold_btn.
function fold_btn_Callback(hObject, eventdata, handles)
% hObject    handle to fold_btn (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)

fp=str2num(get(handles.fp_txt,'String'));
num=length(handles.y);

fdata=fold(handles.y,fp);

plot(handles.axes2,fdata,'.');
setappdata(0,'fdata',fdata);




% --- Executes on button press in get_btn.
function fold_data(handles)

[pfp, output]=getfp(handles.y);
set(handles.pfp_txt, 'String',round(2*pfp.center)/2);

barh(handles.axes3, output.x, output.y);
XLim(1)=min(output.y);
XLim(2)=max(output.y);
YLim(1)=min(output.x)-0.5;
YLim(2)=max(output.x)+0.5;
set(handles.axes3,'XLim',XLim);
set(handles.axes3,'YLim',YLim);


axes(handles.axes3);
hold on;

x=YLim(1):0.01:YLim(2);
y=pfp.bkg+gauss_curve(pfp.center,pfp.fwhm,pfp.intensity,x);

plot(handles.axes3,y,x,'r-','linewidth',2);
hold off;

fdata=fold(handles.y,round(2*pfp.center)/2);

plot(handles.axes2,fdata,'.');
setappdata(0,'fdata', fdata);


% --- Executes on button press in save_btn.
function save_btn_Callback(hObject, eventdata, handles)
% hObject    handle to save_btn (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)
close;


% --- Executes during object creation, after setting all properties.
function figure1_CreateFcn(hObject, eventdata, handles)
% hObject    handle to figure1 (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    empty - handles not created until after all CreateFcns called


% --- Executes on button press in skip_btn.
function skip_btn_Callback(hObject, eventdata, handles)
% hObject    handle to skip_btn (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)
setappdata(0,'fdata',handles.y');
close;
