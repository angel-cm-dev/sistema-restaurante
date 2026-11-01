# ADR 0002 · Dinero en céntimos enteros y reparto por resto mayor

- **Estado:** aceptada
- **Fecha:** 2026-11

## Contexto

La caja divide cuentas en partes iguales o por consumo y reparte la propina entre varios pagos. Con números de coma flotante, `0.1 + 0.2 !== 0.3` y al dividir S/ 100.00 entre 3 se pierden o crean céntimos, lo que descuadra el cierre de caja.

## Decisión

1. Todos los importes se representan como **enteros en céntimos** (`INTEGER` en PostgreSQL, `number` entero en TypeScript). La API recibe y devuelve céntimos (`priceCents`, `amountCents`).
2. Todo reparto usa el **método del resto mayor (Hamilton)**: se asigna la parte entera a cada uno y los céntimos sobrantes van a quienes tuvieron la mayor fracción descartada (empates → menor índice, para que sea determinista).
3. Invariante verificada por pruebas: **la suma de las partes es siempre igual al total**.
4. El IGV (18%) se considera **incluido** en el precio (norma peruana de precios al público) y solo se desglosa: `base = round(subtotal / 1.18)`, `igv = subtotal − base`.

## Consecuencias

- ✅ Cero errores de redondeo acumulados; los pagos cuadran al céntimo con el total.
- ✅ Las funciones (`distributeProportionally`, `splitEqually`, `splitBill`) son puras y se prueban con propiedades.
- ⚠️ El frontend debe convertir para mostrar (`formatMoney`) y para leer entradas (`parseMoney`).
- ⚠️ Si en el futuro se manejan varias monedas, habrá que añadir el código de moneda junto al importe.
