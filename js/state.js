/* =========================================================
   MissApp
   js/state.js

   Shared application state
========================================================= */

export const state = {
  me: null,
  user: null,

  currentConversation: null,

  unsubscribeMessages: null,
  unsubscribeConversations: null,

  registerMode: false
};

window.MissApp = state;
