import {useState,useEffect} from 'react';

const EMPTY=[];
const fresh=()=>({id:crypto.randomUUID(),title:'Nova conversa',messages:[],attachments:[]});
// Browser memory only: no localStorage, sessionStorage, IndexedDB or chat API.
export function useSessionChat(projectId){
  const [groups,setGroups]=useState({});
  useEffect(()=>{if(projectId)setGroups(all=>all[projectId]?all:{...all,[projectId]:(()=>{const chat=fresh();return{active:chat.id,chats:[chat]};})()});},[projectId,!!groups[projectId]]);
  const group=groups[projectId],conversation=group?.chats.find(chat=>chat.id===group.active)||null;
  function modify(action){setGroups(all=>{if(!projectId)return all;const current=all[projectId]||(()=>{const chat=fresh();return{active:chat.id,chats:[chat]};})();return{...all,[projectId]:action(current)};});}
  function updateChat(update){modify(current=>({...current,chats:current.chats.map(chat=>chat.id===current.active?update(chat):chat)}));}
  return{
    conversation,conversations:group?.chats||EMPTY,messages:conversation?.messages||EMPTY,pendingAttachments:conversation?.attachments||EMPTY,
    setMessages(value){updateChat(chat=>{const messages=typeof value==='function'?value(chat.messages):value;return{...chat,messages,title:chat.title==='Nova conversa'?(messages.find(message=>message.role==='user')?.content.slice(0,60)||chat.title):chat.title};});},
    setPendingAttachments(value){updateChat(chat=>({...chat,attachments:typeof value==='function'?value(chat.attachments):value}));},
    newChat(){const chat=fresh();modify(current=>({active:chat.id,chats:[chat,...current.chats]}));return chat;},
    openChat(chat){modify(current=>current.chats.some(c=>c.id===chat.id)?{...current,active:chat.id}:current);},
    renameChat(title){updateChat(chat=>({...chat,title}));},
    deleteChat(id){modify(current=>{let chats=current.chats.filter(chat=>chat.id!==id);if(!chats.length)chats=[fresh()];return{chats,active:chats.some(c=>c.id===current.active)?current.active:chats[0].id};});},
    dropProject(id){setGroups(all=>{const next={...all};delete next[id];return next;});},
    sessionConversationCount(id){return groups[id]?.chats.filter(chat=>chat.messages.length).length||0;},
    clearSessions(){setGroups({});}
  };
}
