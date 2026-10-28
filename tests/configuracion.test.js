import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarConfiguracion } from '../src/services/configuracion.js'

const jwt = (rol) => `x.${Buffer.from(JSON.stringify({ role: rol })).toString('base64url')}.y`
const url = 'https://abcd1234.supabase.co'

test('sin variables se usa el modo demo', () => {
  assert.equal(validarConfiguracion({ url: '', clave: '' }), '')
})

test('configuración válida con clave anon o publishable', () => {
  assert.equal(validarConfiguracion({ url, clave: jwt('anon') }), '')
  assert.equal(validarConfiguracion({ url, clave: 'sb_publishable_abc123' }), '')
  assert.equal(validarConfiguracion({ url: 'http://localhost:54321', clave: jwt('anon') }), '')
})

test('detecta variables incompletas o incorrectas', () => {
  assert.match(validarConfiguracion({ url, clave: '' }), /Falta VITE_SUPABASE_ANON_KEY/)
  assert.match(validarConfiguracion({ url: '', clave: jwt('anon') }), /Falta VITE_SUPABASE_URL/)
  assert.match(validarConfiguracion({ url: 'abcd1234.supabase.co', clave: jwt('anon') }), /no es una dirección válida/)
  assert.match(validarConfiguracion({ url: 'http://abcd1234.supabase.co', clave: jwt('anon') }), /https/)
  assert.match(validarConfiguracion({ url: `${url}/rest/v1`, clave: jwt('anon') }), /sin \/rest\/v1/)
  assert.match(validarConfiguracion({ url, clave: 'cualquier-cosa' }), /no es válida/)
  assert.match(validarConfiguracion({ url, clave: jwt('anon'), dominio: 'sin punto' }), /VITE_AUTH_DOMAIN/)
})

test('rechaza la clave secreta service_role', () => {
  assert.match(validarConfiguracion({ url, clave: jwt('service_role') }), /secreta/)
  assert.match(validarConfiguracion({ url, clave: 'sb_secret_abc' }), /secreta/)
})
