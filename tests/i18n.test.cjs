/* Offline localisation checks for all five shipped language bundles and the UI switch. */
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const asset=name=>fs.readFileSync(path.join(root,'app/src/main/assets',name),'utf8');
const langs=['en','nl','de','fr','es'];
const locales=Object.fromEntries(langs.map(lang=>[lang,JSON.parse(asset(`i18n/${lang}.json`))]));
const keys=Object.keys(locales.en);
assert(keys.length>=390,'Expected the complete catalogue, not a partial translation');
for(const l of langs){
 assert.deepEqual(Object.keys(locales[l]).sort(),keys.slice().sort(),`${l} has different translation keys`);
 for(const [id,value] of Object.entries(locales[l])) assert(value.trim(),`Empty ${l} translation for ${id}`);
}
const englishToKey=Object.fromEntries(Object.entries(locales.en).map(([key,v])=>[v,key]));
for(const [source,expected] of [['Settings','Instellingen'],['Weekstaat','Weekstaat'],['Today','Vandaag'],['HOLD TO START WORK','INGEDRUKT HOUDEN OM TE STARTEN']]) {
 assert.equal(locales.nl[englishToKey[source]],expected);
}
const nodeText={nodeType:3,nodeValue:'Today'};
const sourceNode={nodeType:1,childNodes:[nodeText],matches:()=>false,closest:()=>null,attributes:{},getAttribute(){return null},setAttribute(){}};
nodeText.parentElement=sourceNode;
const documentElement={lang:'en',setAttribute(name,v){this[name]=v}};
const pref={value:'auto'};
const store=new Map();
const languageActual={textContent:''};
const languageSelect={value:'auto'};
const body={nodeType:1,childNodes:[sourceNode],matches:()=>false,closest:()=>null,getAttribute:()=>null,setAttribute(){}};
class Observer {observe(){} disconnect(){} }
const window={__WorkClockCatalog:null,WorkClockAndroid:{deviceLanguage:()=>pref.device || 'nl-NL',languagePreference:()=>pref.value,setLanguagePreference(code){pref.value=code}},dispatchEvent(){},addEventListener(){}};
const context=vm.createContext({window,document:{body,documentElement,getElementById(id){return id==='languageSelect'?languageSelect:id==='languageActual'?languageActual:null}},navigator:{languages:['nl-NL']},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},Node:{TEXT_NODE:3,ELEMENT_NODE:1},MutationObserver:Observer,CustomEvent:class{constructor(n,x){this.type=n;this.detail=x.detail}},Object,Map,WeakMap,Set,console});
vm.runInContext(asset('i18n-catalog.js'),context);
vm.runInContext(asset('i18n.js'),context);
const api=context.window.WorkClockI18n;
assert.equal(api.locale,'nl');
assert.equal(nodeText.nodeValue,'Vandaag','Initial device locale must translate existing text');
api.setLanguage('es',true);
assert.equal(api.locale,'es');
assert.equal(nodeText.nodeValue,'Hoy');
assert.equal(documentElement.lang,'es');
assert.equal(pref.value,'es','Native Android preference must be kept in sync');
assert.equal(store.get('workclock-language-v1'),'es');
api.setLanguage('de',true);
assert.equal(nodeText.nodeValue,'Heute');
api.setLanguage('fr',true);
assert.equal(nodeText.nodeValue,'Aujourd’hui');
api.setLanguage('en',true);
assert.equal(nodeText.nodeValue,'Today','English must restore original text without reloading');
assert.equal(api.t('User project 421'),'User project 421','Unrecognised user data must not be translated');
api.setLanguage('auto',true);
assert.equal(nodeText.nodeValue,'Vandaag','Automatic mode must fall back to device locale');
pref.device='fr-FR';api.syncNative();
assert.equal(nodeText.nodeValue,'Aujourd’hui','Automatic mode follows changed device locale');
assert.equal(api.attentionCount(2),'2 journées à vérifier');
assert.equal(api._translateText('🌐 Automatic · device language'),'🌐 Automatique · langue de l’appareil');
assert.equal(api._translateText('🇳🇱 Nederlands'),'🇳🇱 Nederlands','Endonyms must remain visible');
assert.equal(api._translateText('Unlisted customer'),'Unlisted customer');
const html=asset('index.html'),js=asset('app.js'),manifest=fs.readFileSync(path.join(root,'app/src/main/AndroidManifest.xml'),'utf8');
assert(html.includes('id="languageSelect"')&&html.includes('value="auto"'));
for(const l of langs)assert(html.includes(`value="${l}"`));
assert(html.includes('src="./i18n-catalog.js"')&&html.includes('src="./i18n.js"'));
assert(manifest.includes('android:localeConfig="@xml/locale_config"'));
assert(js.includes('weekdayFormatter')&&js.includes('WorkClockI18n.setLanguage'));
for(const l of langs) assert(fs.existsSync(path.join(root,'app/src/main/res',l==='en'?'values':`values-${l}`,'strings.xml')));
console.log(`i18n: ${keys.length} complete messages × 5 languages; automatic/manual selection, reversible translations, native resources passed.`);
