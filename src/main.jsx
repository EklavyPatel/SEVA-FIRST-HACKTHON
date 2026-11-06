import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import {prepareAccountLink} from './lib/account-links.js';
import './styles.css';
import './workspace.css';

const emailLink=prepareAccountLink(window);
createRoot(document.getElementById('root')).render(<React.StrictMode><App emailLink={emailLink}/></React.StrictMode>);
