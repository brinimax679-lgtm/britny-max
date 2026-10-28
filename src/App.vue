<script setup>
import { TriangleAlert } from 'lucide-vue-next'
import ToastHost from '@/components/ToastHost.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import { errorConfiguracion } from '@/services'
</script>

<template>
  <main v-if="errorConfiguracion" class="flex min-h-dvh items-center justify-center p-4">
    <div class="card max-w-lg p-8">
      <TriangleAlert class="size-10 text-amber-500" />
      <h1 class="mt-4 text-xl font-semibold text-slate-900">Configuración de Supabase incompleta</h1>
      <p class="mt-2 text-slate-600">{{ errorConfiguracion }}</p>
      <p class="mt-4 text-sm text-slate-500">
        Corrige el archivo <code class="codigo">.env</code> (o las variables de entorno en Vercel) y vuelve a iniciar la aplicación.
        Para usar el modo demo, deja vacías <code class="codigo">VITE_SUPABASE_URL</code> y <code class="codigo">VITE_SUPABASE_ANON_KEY</code>.
      </p>
    </div>
  </main>
  <template v-else>
    <RouterView />
    <ToastHost />
    <ConfirmHost />
  </template>
</template>
