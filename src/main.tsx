import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {StageApp} from '../components/learn/stage-app';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<StrictMode><StageApp/></StrictMode>);
