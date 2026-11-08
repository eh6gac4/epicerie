import { createRouter, createWebHistory } from 'vue-router'
import AgentAccountsView from '../views/AgentAccountsView.vue'
import PasskeysView from '../views/PasskeysView.vue'
import HomeView from '../views/HomeView.vue'
import ListView from '../views/ListView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/settings/passkeys', component: PasskeysView },
    { path: '/settings/accounts', component: AgentAccountsView },
    { path: '/settings/agents', redirect: '/settings/accounts' },
    { path: '/', component: HomeView },
    { path: '/list/:id', component: ListView },
  ],
})
