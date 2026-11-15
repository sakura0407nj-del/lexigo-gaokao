import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {LearnApp} from '../components/learn/learn-app';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<StrictMode><LearnApp/></StrictMode>);
