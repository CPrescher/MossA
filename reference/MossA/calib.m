function varargout = calib(varargin)
% CALIB M-file for calib.fig
%      CALIB, by itself, creates a new CALIB or raises the existing
%      singleton*.
%
%      H = CALIB returns the handle to a new CALIB or the handle to
%      the existing singleton*.
%
%      CALIB('CALLBACK',hObject,eventData,handles,...) calls the local
%      function named CALLBACK in CALIB.M with the given input arguments.
%
%      CALIB('Property','Value',...) creates a new CALIB or raises the
%      existing singleton*.  Starting from the left, property value pairs are
%      applied to the GUI before calib_OpeningFcn gets called.  An
%      unrecognized property name or invalid value makes property application
%      stop.  All inputs are passed to calib_OpeningFcn via varargin.
%
%      *See GUI Options on GUIDE's Tools menu.  Choose "GUI allows only one
%      instance to run (singleton)".
%
% See also: GUIDE, GUIDATA, GUIHANDLES

% Edit the above text to modify the response to help calib

% Last Modified by GUIDE v2.5 22-Jul-2010 12:45:23

% Begin initialization code - DO NOT EDIT
gui_Singleton = 1;
gui_State = struct('gui_Name',       mfilename, ...
                   'gui_Singleton',  gui_Singleton, ...
                   'gui_OpeningFcn', @calib_OpeningFcn, ...
                   'gui_OutputFcn',  @calib_OutputFcn, ...
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


% --- Executes just before calib is made visible.
function calib_OpeningFcn(hObject, eventdata, handles, varargin)
% This function has no output args, see OutputFcn.
% hObject    handle to figure
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)
% varargin   command line arguments to calib (see VARARGIN)

%get inputdata
handles.data=varargin{1};
handles.y=handles.data;
channels=length(handles.y);

%normalize to 100
factor=100/max(handles.y);
handles.y=handles.y.*factor;

%calculate x data
if getappdata(0,'sinusoidal')
   handles.x=-cos((0:channels-1)/(channels-1)*pi)*5; 
else
    handles.x(1:channels)=-5+10/channels*(1:channels);
end

%plotting data
plot(handles.axes1, handles.x, handles.y, '.');
handles.ivel=5;
% Choose default command line output for calib
handles.output = hObject;

% Update handles structure
guidata(hObject, handles);

% UIWAIT makes calib wait for user response (see UIRESUME)
uiwait(hObject);


% --- Outputs from this function are returned to the command line.
function varargout = calib_OutputFcn(hObject, eventdata, handles) 
% varargout  cell array for returning output args (see VARARGOUT);
% hObject    handle to figure
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)

% Get default command line output from handles structure
varargout{1} = getappdata(0,'stdvel');
varargout{2} = getappdata(0,'stdcs');



function ivel_txt_Callback(hObject, eventdata, handles)
% hObject    handle to ivel_txt (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)

% Hints: get(hObject,'String') returns contents of ivel_txt as text
%        str2double(get(hObject,'String')) returns contents of ivel_txt as a double
handles.ivel=str2double(get(hObject,'String'));
channels=length(handles.y);

if getappdata(0,'sinusoidal')
   handles.x=-cos((0:channels-1)/(channels-1)*pi)*handles.ivel; 
else
    handles.x(1:channels)=-handles.ivel+2*handles.ivel/channels*(1:channels);
end

plot(handles.axes1, handles.x, handles.y,'.');

%update data
guidata(hObject, handles);



% --- Executes during object creation, after setting all properties.
function ivel_txt_CreateFcn(hObject, eventdata, handles)
% hObject    handle to ivel_txt (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    empty - handles not created until after all CreateFcns called

% Hint: edit controls usually have a white background on Windows.
%       See ISPC and COMPUTER.
if ispc && isequal(get(hObject,'BackgroundColor'), get(0,'defaultUicontrolBackgroundColor'))
    set(hObject,'BackgroundColor','white');
end


% --- Executes on button press in cal_btn.
function cal_btn_Callback(hObject, eventdata, handles)
% hObject    handle to cal_btn (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)

model=@(x,xdata)(100-sextet(x(1),x(2),x(3),0, x(4),x(5),x(6),xdata)-x(7)-x(8)*xdata);
channels=length(handles.y);

lb=  [-2; 0;      0;   0; 0.001;   0.001; -5; -5];
ub=  [ 2; 1;    inf; inf;   inf;     inf;  5;  5];
ival=[ 0; 0.19;  5; 1.5;    33;       3;  0;  0];

cvel=handles.ivel;


for n=1:10
  [param, resnorm, residual] = lsqcurvefit(model, ival, handles.x, handles.y, lb, ub);
  ival=param;
  cvel=33*cvel/param(5);
  if getappdata(0,'sinusoidal')
      handles.x=-cos((0:channels-1)/(channels-1)*pi)*cvel;
  else
      handles.x(1:channels)=-cvel+2*cvel/(channels-1).*(0:channels-1);
  end
end


setappdata(0,'stdcs', param(1));
setappdata(0,'stdvel', cvel);
set(handles.cvel_txt,'String',cvel);
set(handles.ccs_txt,'String', param(1));

calc_y=model(param,handles.x);

axes(handles.axes1);
plot(handles.axes1, handles.x, handles.y,'.');
hold on;
plot(handles.axes1, handles.x, calc_y,'r-');
set(handles.axes1,'XLim', [min(handles.x) max(handles.x)]);
hold off;
plot(handles.axes2, handles.x,residual,'r.');
set(handles.axes2,'XLim', [min(handles.x) max(handles.x)]);

%update data
guidata(hObject, handles);


function cvel_txt_Callback(hObject, eventdata, handles)
% hObject    handle to cvel_txt (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)

% Hints: get(hObject,'String') returns contents of cvel_txt as text
%        str2double(get(hObject,'String')) returns contents of cvel_txt as a double


% --- Executes during object creation, after setting all properties.
function cvel_txt_CreateFcn(hObject, eventdata, handles)
% hObject    handle to cvel_txt (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    empty - handles not created until after all CreateFcns called

% Hint: edit controls usually have a white background on Windows.
%       See ISPC and COMPUTER.
if ispc && isequal(get(hObject,'BackgroundColor'), get(0,'defaultUicontrolBackgroundColor'))
    set(hObject,'BackgroundColor','white');
end



function ccs_txt_Callback(hObject, eventdata, handles)
% hObject    handle to ccs_txt (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)

% Hints: get(hObject,'String') returns contents of ccs_txt as text
%        str2double(get(hObject,'String')) returns contents of ccs_txt as a double


% --- Executes during object creation, after setting all properties.
function ccs_txt_CreateFcn(hObject, eventdata, handles)
% hObject    handle to ccs_txt (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    empty - handles not created until after all CreateFcns called

% Hint: edit controls usually have a white background on Windows.
%       See ISPC and COMPUTER.
if ispc && isequal(get(hObject,'BackgroundColor'), get(0,'defaultUicontrolBackgroundColor'))
    set(hObject,'BackgroundColor','white');
end


% --- Executes on button press in save_btn.
function save_btn_Callback(hObject, eventdata, handles)
% hObject    handle to save_btn (see GCBO)
% eventdata  reserved - to be defined in a future version of MATLAB
% handles    structure with handles and user data (see GUIDATA)
out(1)=getappdata(0,'stdvel');
out(2)=getappdata(0,'stdcs');
if ismac
    if ~exist('~/.MossA', 'file')
        mkdir('~/.MossA')
    end
    fid=fopen('~/.MossA/calibration.txt','w+');
    dlmwrite('~/.MossA/calibration.txt',out);
else
    fid=fopen('calibration.txt','w+');
    dlmwrite('calibration.txt',out);
end
fclose(fid);
close;
