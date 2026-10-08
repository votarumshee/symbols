import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const xml=await fs.readFile(new URL('android/app/src/main/res/drawable/ic_symbols.xml',root),'utf8');
const paths=[...xml.matchAll(/<path\s+([^>]+)\/>/g)].map(([,a])=>'<path '+a.replace(/android:fillColor=/g,'fill=').replace(/android:strokeColor=/g,'stroke=').replace(/android:strokeWidth=/g,'stroke-width=').replace(/android:pathData=/g,'d=')+'/>').join('');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});
 await page.setContent('<style>body{margin:0;background:#10231f}</style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="1024" height="1024">'+paths+'</svg>');
 const png=await page.screenshot();await fs.writeFile(new URL('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',root),png);
 await page.setContent('<style>body{margin:0;background:#10231f;display:grid;place-items:center;height:1024px}</style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="240" height="240">'+paths+'</svg>');
 const splash=await page.screenshot();for(const name of ['splash-2732x2732.png','splash-2732x2732-1.png','splash-2732x2732-2.png'])await fs.writeFile(new URL('ios/App/App/Assets.xcassets/Splash.imageset/'+name,root),splash);
 console.log('Rendered existing Symbols vector into iOS icon/splash.');
}finally{await browser.close();}
