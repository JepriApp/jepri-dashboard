// Formato acordado para los datos de contacto de customer (ver
// scripts/fix_customer_phone_format.sql para el detalle de por qué).

// "+57" + celular de 10 dígitos, o "+57" + dígito regional viejo (1,2,4-8) + 7 dígitos locales.
export const CUSTOMER_PHONE_REGEX = /^\+57(3\d{9}|[124-8]\d{7})$/;
export const CUSTOMER_PHONE_HELP =
  "Formato inválido. Usa +57 seguido del celular a 10 dígitos (ej. +573134567890) o del indicativo antiguo de una cifra + número local a 7 dígitos para fijos (ej. +5725663458 para Cali).";

// Número con código de país (E.164) o un id alfanumérico (para canales que no son un número).
export const CUSTOMER_WHATSAPP_ID_REGEX = /^(\+\d{8,15}|[A-Za-z0-9_.-]{3,64})$/;
export const CUSTOMER_WHATSAPP_ID_HELP =
  "Ingresa un número con código de país (+573134567890) o un id alfanumérico válido.";
