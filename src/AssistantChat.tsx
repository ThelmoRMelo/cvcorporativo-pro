import { useEffect, useRef, useState } from 'react';
import { Bot, FileText, Search, MessageCircle, Volume2, VolumeX, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { supabase } from './integrations/supabase/client';
import ResolvedImage from './ResolvedImage';
import type { ResumePreviewCandidate } from './CandidateResumePreview';
import { formatExperiencesFull, formatExperiencesSimple, mergeActivities, newExperience, parseMonth, parseYear, sameJob, type ExperienceItem } from './lib/experiences';

type Resume = ResumePreviewCandidate;
type ChatRole='user'|'assistant';
type Suggestions={company:string;role:string;suggestions:string[]};
type ChatMessage={id:string;role:ChatRole;text:string;suggestions?:Suggestions};
type PublicAssistantConfig={assistant_name:string;assistant_avatar_url:string|null;enabled:boolean;welcome_message:string};
type ResumePatch={
  fullName?:string;jobTitle?:string;email?:string;phone?:string;address?:string;linkedin?:string;portfolio?:string;summary?:string;
  experiences?:Array<{company?:string;role?:string;start_month?:number|string;start_year?:number|string;end_month?:number|string;end_year?:number|string;current?:boolean;activities?:string[]|string;period?:string;description?:string}>;
  education?:Array<{institution?:string;course?:string;period?:string}>;courses?:string[];skills?:string[];languages?:string[];
};
type AssistantChatProps={candidate:Resume;onUpdateCandidate:(updated:Resume)=>void;onOpenPreview?:()=>void;closeSignal?:number};
const DEFAULT_WELCOME='Olá! Eu sou a Anya, sua assistente de entrevista. Vou ajudar você a contar sua trajetória profissional. Para começar, qual é o seu nome completo?';
const makeMessage=(role:ChatRole,text:string):ChatMessage=>({id:crypto.randomUUID(),role,text});

export default function AssistantChat({candidate,onUpdateCandidate,onOpenPreview,closeSignal}:AssistantChatProps){
  const [config,setConfig]=useState<PublicAssistantConfig|null>(null);
  const [isOpen,setIsOpen]=useState(false);
  useEffect(()=>{if(closeSignal)setIsOpen(false)},[closeSignal]);
  const [showHint,setShowHint]=useState(false);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [input,setInput]=useState('');
  const [isLoading,setIsLoading]=useState(false);
  const [isDone,setIsDone]=useState(false);
  const [voiceOn,setVoiceOn]=useState(()=>{try{return localStorage.getItem('anya-voice')==='on'}catch{return false}});
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const queueRef=useRef<Promise<void>>(Promise.resolve());
  const genRef=useRef(0);
  const stopVoice=()=>{genRef.current++;queueRef.current=Promise.resolve();audioRef.current?.pause();audioRef.current=null;if(typeof window!=='undefined'&&'speechSynthesis' in window)window.speechSynthesis.cancel()};
  const browserSpeak=(text:string)=>new Promise<void>(resolve=>{if(typeof window==='undefined'||!('speechSynthesis' in window))return resolve();const u=new SpeechSynthesisUtterance(text);u.lang='pt-BR';const v=window.speechSynthesis.getVoices().find(x=>x.lang?.toLowerCase().startsWith('pt'));if(v)u.voice=v;u.onend=()=>resolve();u.onerror=()=>resolve();window.speechSynthesis.speak(u)});
  const speak=(text:string)=>{const gen=genRef.current;const audioPromise=supabase.functions.invoke('assistant-voice',{body:{action:'speak',text}}).then(r=>r.data?.ok?`data:${r.data.mime};base64,${r.data.audio_base64}`:null).catch(()=>null);queueRef.current=queueRef.current.then(async()=>{const src=await audioPromise;if(gen!==genRef.current)return;if(!src){await browserSpeak(text);return}await new Promise<void>(resolve=>{const a=new Audio(src);audioRef.current=a;a.onended=()=>resolve();a.onerror=()=>resolve();a.onpause=()=>resolve();a.play().catch(()=>resolve())})})};
  const spokenRef=useRef<Set<string>>(new Set());
  const candRef=useRef(candidate);candRef.current=candidate;
  const pushCandidate=(c:Resume)=>{candRef.current=c;onUpdateCandidate(c)};
  const endRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{let active=true;const loadConfig=async()=>{try{const {data,error}=await supabase.rpc('get_public_assistant_config');if(!active||error)return;const row=data?.[0];if(!row?.enabled)return;const next:PublicAssistantConfig={assistant_name:row.assistant_name||'Anya',assistant_avatar_url:row.assistant_avatar_url||null,enabled:row.enabled,welcome_message:row.welcome_message||DEFAULT_WELCOME};setConfig(next);setMessages([makeMessage('assistant',next.welcome_message)]);setShowHint(true)}catch{/* Chat stays hidden when public settings cannot be loaded. */}};void loadConfig();return()=>{active=false}},[]);
  useEffect(()=>{if(!showHint)return;const timer=window.setTimeout(()=>setShowHint(false),7000);return()=>window.clearTimeout(timer)},[showHint]);
  useEffect(()=>{if(isOpen)endRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages,isLoading,isOpen]);
  useEffect(()=>{if(!isOpen)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setIsOpen(false)};window.addEventListener('keydown',key);document.body.classList.add('assistant-chat-open');inputRef.current?.focus();return()=>{window.removeEventListener('keydown',key);document.body.classList.remove('assistant-chat-open')}},[isOpen]);
  // Garante que o cursor retorne ao campo de texto quando a Anya terminar de responder.
  useEffect(()=>{
    if(!isOpen||isLoading)return;
    const timer=window.setTimeout(()=>inputRef.current?.focus(),60);
    return()=>window.clearTimeout(timer);
  },[isOpen,isLoading]);

  useEffect(()=>{if(!isOpen)return;const vv=window.visualViewport;const apply=()=>{const h=vv?vv.height:window.innerHeight;const top=vv?vv.offsetTop:0;document.documentElement.style.setProperty('--anya-vh',`${h}px`);document.documentElement.style.setProperty('--anya-top',`${top}px`)};apply();vv?.addEventListener('resize',apply);vv?.addEventListener('scroll',apply);window.addEventListener('resize',apply);return()=>{vv?.removeEventListener('resize',apply);vv?.removeEventListener('scroll',apply);window.removeEventListener('resize',apply);document.documentElement.style.removeProperty('--anya-vh');document.documentElement.style.removeProperty('--anya-top')}},[isOpen]);
  useEffect(()=>{let stored:string|null=null;try{stored=localStorage.getItem('anya-voice')}catch{/* ignore */}if(stored)return;void supabase.functions.invoke('assistant-voice',{body:{action:'config'}}).then(r=>{if(r.data?.ok)setVoiceOn(r.data.voice_default_on===true)}).catch(()=>{})},[]);
  const toggleVoice=()=>setVoiceOn(v=>{const n=!v;try{localStorage.setItem('anya-voice',n?'on':'off')}catch{/* ignore */}if(!n)stopVoice();return n});
  useEffect(()=>{const pending=messages.filter(m=>m.role==='assistant'&&!spokenRef.current.has(m.id));pending.forEach(m=>spokenRef.current.add(m.id));if(!voiceOn||!isOpen)return;pending.forEach(m=>speak(m.text))},[messages,voiceOn,isOpen]);
  useEffect(()=>{if(!isOpen)stopVoice()},[isOpen]);
  useEffect(()=>()=>stopVoice(),[]);

  if(!config?.enabled)return null;

  const restart=()=>{setMessages([makeMessage('assistant',config.welcome_message)]);setInput('');setIsDone(false);setIsLoading(false)};
  const applyPatch=(patch:ResumePatch)=>{
    const updated:Resume={...candRef.current};
    if(patch.fullName!==undefined)updated.name=patch.fullName;
    if(patch.jobTitle!==undefined)updated.role=patch.jobTitle;
    if(patch.email!==undefined)updated.email=patch.email;
    if(patch.phone!==undefined)updated.phone=patch.phone;
    if(patch.address!==undefined)updated.city=patch.address;
    if(patch.linkedin!==undefined)updated.linkedin=patch.linkedin;
    if(patch.portfolio!==undefined)updated.portfolio=patch.portfolio;
    if(patch.summary!==undefined)updated.summary=patch.summary;
    if(Array.isArray(patch.experiences)&&patch.experiences.length>0){
      let list:ExperienceItem[]=[...(updated.experiences||[])];
      for(const exp of patch.experiences){
        const idx=list.findIndex(e=>sameJob(e,exp));const base=idx>=0?list[idx]:{...newExperience(),company:exp.company||'',role:exp.role||''};
        const acts=Array.isArray(exp.activities)?exp.activities:typeof exp.activities==='string'?exp.activities.split(/\n/):exp.description?exp.description.split(/\n/):[];
        const next:ExperienceItem={...base,
          startMonth:parseMonth(exp.start_month)||base.startMonth,startYear:parseYear(exp.start_year)||base.startYear,
          endMonth:exp.current?'':parseMonth(exp.end_month)||base.endMonth,endYear:exp.current?'':parseYear(exp.end_year)||base.endYear,
          current:exp.current===true?true:exp.end_year?false:base.current,activities:mergeActivities(base.activities,acts)};
        if(idx>=0)list[idx]=next;else list=[...list,next];
      }
      updated.experiences=list;updated.experience=formatExperiencesFull(list);updated.experience_simple=formatExperiencesSimple(list);
    }
    const currentEduLines=(updated.education||'').split('\n').map(line=>line.trim()).filter(Boolean);
    const existingEdu=currentEduLines.filter(line=>!line.toLowerCase().startsWith('curso:'));
    const existingCourses=currentEduLines.filter(line=>line.toLowerCase().startsWith('curso:'));
    const newEdu=(patch.education||[]).map(item=>`${item.course||''} — ${item.institution||''}${item.period?` (${item.period})`:''}`.trim()).filter(Boolean);
    const newCourses=(patch.courses||[]).map(course=>`Curso: ${course.replace(/^curso:\s*/i,'').trim()}`).filter(Boolean);
    if(patch.education!==undefined||patch.courses!==undefined){
      const finalEdu=patch.education!==undefined?(newEdu.length?newEdu:existingEdu):existingEdu;
      const finalCourses=patch.courses!==undefined?Array.from(new Set([...existingCourses,...newCourses])):existingCourses;
      updated.education=[...finalEdu,...finalCourses].filter(Boolean).join('\n');
    }
    const skillItems=[...(patch.skills||[]),...(patch.languages||[]).map(language=>`Idioma: ${language}`)];
    if(skillItems.length)updated.skills=skillItems.join(', ');
    pushCandidate(updated);
  };
  const confirmSuggestions=(msgId:string,sug:Suggestions,picked:string[])=>{
    const list=[...(candRef.current.experiences||[])];const idx=list.findIndex(e=>sameJob(e,sug));
    if(idx>=0)list[idx]={...list[idx],activities:mergeActivities(list[idx].activities,picked)};else list.push({...newExperience(),company:sug.company,role:sug.role,activities:mergeActivities('',picked)});
    pushCandidate({...candRef.current,experiences:list,experience:formatExperiencesFull(list),experience_simple:formatExperiencesSimple(list)});
    setMessages(current=>current.map(m=>m.id===msgId?{...m,suggestions:undefined}:m));
    void sendMessage(picked.length?`Selecionei estas atividades: ${picked.join('; ')}`:'Nenhuma dessas atividades corresponde ao que eu fazia.');
  };
  const sendMessage=async(override?:string)=>{
    const text=(override??input).trim();if(!text||isLoading)return;
    const userMessage=makeMessage('user',text);const nextMessages=[...messages,userMessage];setMessages(nextMessages);setInput('');setIsLoading(true);
    if(inputRef.current)inputRef.current.style.height='auto';
    try{
      const {data,error}=await supabase.functions.invoke('assistant-interview',{
        body:{messages:nextMessages.map(({role,text:messageText})=>({role,text:messageText})),resume:candRef.current},
      });
      if(error){
        setMessages(current=>[...current,makeMessage('assistant','Tivemos uma pequena oscilação na conexão. Por favor, tente novamente em instantes.')]);
        return;
      }
      if(!data?.ok){
        const friendlyError=typeof data?.error==='string'&&data.error.trim()
          ?data.error.trim()
          :'Tivemos uma pequena oscilação na conexão. Por favor, tente novamente em instantes.';
        setMessages(current=>[...current,makeMessage('assistant',friendlyError)]);
        return;
      }
      if(data.resume_patch&&typeof data.resume_patch==='object')applyPatch(data.resume_patch as ResumePatch);
      const response:ChatMessage=makeMessage('assistant',typeof data.reply==='string'&&data.reply.trim()?data.reply.trim():'Entendi! O que mais você gostaria de adicionar?');
      if(data.activity_suggestions?.suggestions?.length)response.suggestions=data.activity_suggestions as Suggestions;
      const additions=[response];
      if(data.done===true){setIsDone(true);additions.push(makeMessage('assistant','Sua entrevista foi concluída! Confira os dados na prévia do currículo e escolha o modelo que mais combina com você.'))}
      setMessages(current=>[...current,...additions]);
    }catch{
      setMessages(current=>[...current,makeMessage('assistant','Não consegui me conectar no momento. Verifique sua conexão e tente novamente em instantes.')]);
    }finally{setIsLoading(false)}
  };

  return <>
    <div className="assistant-launcher-wrap">{showHint&&!isOpen&&<div className="assistant-launcher-tooltip">Montar meu currículo com a {config.assistant_name}<span/> </div>}<button type="button" className="assistant-launcher-btn" aria-label={`Conversar com ${config.assistant_name}`} aria-expanded={isOpen} onClick={()=>{setShowHint(false);setIsOpen(value=>!value)}}>{config.assistant_avatar_url?<ResolvedImage source={config.assistant_avatar_url} kind="template" id="assistant-launcher-avatar" alt={config.assistant_name} className="assistant-launcher-avatar"/>:<span className="assistant-launcher-fallback"><Bot size={26}/><Sparkles size={12}/></span>}<i className="assistant-launcher-badge"/></button><span className="assistant-pulse-ring"/></div>
    {isOpen&&<div className="assistant-chat-modal" role="dialog" aria-modal="true" aria-label={`Chat com ${config.assistant_name}`}>
      <header className="assistant-chat-header"><div className="assistant-chat-avatar">{config.assistant_avatar_url?<ResolvedImage source={config.assistant_avatar_url} kind="template" id="assistant-chat-header-avatar" alt={config.assistant_name} className="assistant-chat-avatar-image"/>:<Bot size={19}/>}</div><div className="assistant-chat-heading"><b>{config.assistant_name}</b><span><i/> Pronta para ajudar</span></div>{onOpenPreview&&<button type="button" className="assistant-chat-icon-btn assistant-preview-btn" title="Ver meu currículo nos modelos" aria-label="Ver meu currículo nos modelos" onClick={onOpenPreview}><FileText size={17}/><Search size={10} strokeWidth={3}/></button>}<button type="button" className="assistant-chat-icon-btn" title={voiceOn?'Alto-falante ligado — clique para silenciar':'Alto-falante desligado — clique para ouvir a Anya'} aria-label={voiceOn?'Silenciar voz':'Ouvir voz'} aria-pressed={voiceOn} onClick={toggleVoice}>{voiceOn?<Volume2 size={16}/>:<VolumeX size={16}/>}</button><button type="button" className="assistant-chat-icon-btn" title="Reiniciar conversa" aria-label="Reiniciar conversa" onClick={restart}><RotateCcw size={16}/></button><button type="button" className="assistant-chat-icon-btn" title="Fechar conversa" aria-label="Fechar conversa" onClick={()=>setIsOpen(false)}><X size={19}/></button></header>
      <div className="assistant-chat-messages" aria-live="polite">{messages.map(message=><div key={message.id} className={`assistant-chat-row ${message.role==='user'?'user':'assistant'}`}>{message.role==='assistant'&&<span className="assistant-chat-message-avatar">{config.assistant_avatar_url?<ResolvedImage source={config.assistant_avatar_url} kind="template" id={`assistant-msg-${message.id}`} alt="" className="assistant-chat-avatar-image"/>:<Bot size={13}/>}</span>}<div className="assistant-chat-bubble">{message.text}</div></div>).flatMap((row,i)=>{const m=messages[i];return m.suggestions?[row,<SuggestionCard key={`${m.id}-s`} sug={m.suggestions} disabled={isLoading} onConfirm={picked=>confirmSuggestions(m.id,m.suggestions!,picked)} onMore={()=>void sendMessage(`Pode sugerir outras atividades para ${m.suggestions!.role}?`)}/>]:[row]})}{isLoading&&<div className="assistant-chat-row assistant"><span className="assistant-chat-message-avatar">{config.assistant_avatar_url?<ResolvedImage source={config.assistant_avatar_url} kind="template" id="assistant-typing-avatar" alt="" className="assistant-chat-avatar-image"/>:<Bot size={13}/>}</span><div className="assistant-chat-typing"><span/><span/><span/></div><small>{config.assistant_name} está digitando...</small></div>}<div ref={endRef}/></div>
      {isDone&&<div className="assistant-chat-done"><Sparkles size={15}/> Seus dados estão prontos!{onOpenPreview&&<button type="button" className="assistant-done-preview" onClick={onOpenPreview}><FileText size={13}/> Ver modelos do Plano Intermediário →</button>}</div>}
      <div className="assistant-chat-input-area"><textarea ref={inputRef} rows={1} value={input} readOnly={isLoading} placeholder={isLoading?'Aguarde a resposta da Anya…':'Escreva sua resposta…'} aria-label="Sua mensagem" onChange={event=>{if(isLoading)return;setInput(event.target.value);event.currentTarget.style.height='auto';event.currentTarget.style.height=`${Math.min(event.currentTarget.scrollHeight,120)}px`}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(!isLoading)void sendMessage()}}}/><button type="button" aria-label="Enviar mensagem" title="Enviar mensagem" disabled={!input.trim()||isLoading} onClick={()=>void sendMessage()}><Send size={17}/></button></div>
      <div className="assistant-chat-footnote">Seus dados são preenchidos no currículo enquanto conversamos.</div>
    </div>}
  </>;
}

function SuggestionCard({sug,disabled,onConfirm,onMore}:{sug:Suggestions;disabled:boolean;onConfirm:(picked:string[])=>void;onMore:()=>void}){
  const [picked,setPicked]=useState<string[]>([]);const [custom,setCustom]=useState('');
  const toggle=(s:string)=>setPicked(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s]);
  const all=()=>mergeActivities(picked.join('\n'),custom.split(/\n|;/)).split('\n').filter(Boolean);
  return <div className="assistant-suggestions"><small>Atividades sugeridas para <b>{sug.role}</b>{sug.company?` · ${sug.company}`:''}</small>
    {sug.suggestions.map(s=><label key={s}><input type="checkbox" checked={picked.includes(s)} onChange={()=>toggle(s)}/>{s}</label>)}
    <input type="text" placeholder="Escrever uma atividade própria…" value={custom} onChange={e=>setCustom(e.target.value)}/>
    <div className="assistant-suggestions-actions"><button type="button" disabled={disabled||!all().length} onClick={()=>onConfirm(all())}>Confirmar seleção</button><button type="button" disabled={disabled} onClick={onMore}>Outras sugestões</button><button type="button" disabled={disabled} onClick={()=>onConfirm([])}>Nenhuma corresponde</button></div>
  </div>;
}
