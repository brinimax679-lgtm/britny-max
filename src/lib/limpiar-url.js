// Debe ser la PRIMERA importación de main.js: el router lee la dirección en
// cuanto se importa y la vuelve a escribir, así que los tokens se quitan antes.
import { limpiarUrlSensible } from './url-segura.js'

limpiarUrlSensible()
