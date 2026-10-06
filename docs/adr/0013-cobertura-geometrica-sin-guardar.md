# 0013. Cobertura geométrica, calculada al pedirla y sin guardar escenarios

Fecha: 2026-10-06. Estado: aceptada. Sustituye la última línea de la ADR 0003 («los escenarios
tendrán tablas propias») y aplica la parte de medición de la ADR 0004.

## Contexto

B4 compara la cobertura de la red real con la de un escenario: estaciones hipotéticas añadidas,
estaciones reales movidas o quitadas. El brief pide un cálculo geométrico, reproducible y
explicable, con un área de estudio explícita como denominador, sin contar dos veces los
solapes, sin llamar isócrona a un círculo, sin que la capacidad cambie nada y sin conclusiones
de demanda. También pide no guardar sin límite escenarios anónimos.

## Decisión

- **Modelo `cobertura-geometrica` v1**: círculos del radio elegido (50–1000 m, en línea recta)
  alrededor de cada estación, unidos y recortados al área de estudio, medidos en EPSG:25831.
  Cada círculo es un polígono de 64 lados (el área sale un 0,16 % por debajo de la del círculo:
  se dice en los supuestos). La respuesta lleva el modelo, sus supuestos, el escenario tal cual
  se pidió y la red de referencia (fuente, instante y estaciones).
- **Red base**: las estaciones con ubicación vigente en el instante de referencia (versiones),
  estén o no operativas: la cobertura es de la red, no de su estado en ese momento.
- **Áreas de estudio**: los 10 distritos del archivo oficial del Ajuntament (CC BY 4.0, EPSG:25831,
  embebido sin modificar) y Barcelona como su unión: 101,702 km². La unión deja 24 rendijas
  entre límites vecinos que no coinciden (14 m² en total; la mayor, 10,7 m²): se rellenan las de
  menos de 100 m². `ingest study-areas` las carga y se puede repetir.
- **Sin guardar**: `POST /api/scenarios/coverage` calcula y responde. El escenario lo guarda el
  cliente (en la URL); en la base de datos no hay escenarios ni estaciones hipotéticas, así que
  no se pueden mezclar con las observaciones.
- **Límites**: radio de 50 a 1000 m, hasta 50 estaciones hipotéticas y 100 movidas, todas dentro
  de la zona de Barcelona; solo se mueven o quitan estaciones de la red base; 10 s como mucho por
  cálculo (`statement_timeout`). Las geometrías se devuelven en WGS84 simplificadas 1 m para
  dibujarlas; las superficies se calculan sin simplificar y se redondean al metro cuadrado (una
  estación en zona ya cubierta dejaba restos de coma flotante de 1e-8 m² como «ganancia»).
- **Alcance de cada cambio** (`geometries.reach`): el círculo entero de cada estación nueva,
  movida o quitada (el mismo polígono del cálculo, sin recortar) y la parte que cae dentro del
  área de estudio. La web dibuja el de las nuevas y movidas aunque no ganen nada, y explica por
  qué un cambio no mueve la superficie: zona ya cubierta o fuera del área de estudio.

## Consecuencias

- Comprobado contra PostGIS: un círculo de 300 m mide 282 289 m² (64 lados), dos estaciones en
  el mismo punto cuentan una vez, dos círculos solapados se unen sin doble conteo, una estación
  en la esquina de un cuadrado de estudio cubre un cuarto exacto, una nueva rodeada de otras
  gana 0 m² exactos, una fuera del área de estudio no alcanza nada de ella, un cambio de
  capacidad no cambia nada y el mismo escenario da el mismo resultado byte a byte.
- Con la red real del 20-8-2026 (544 estaciones): 56,95 km² a menos de 300 m, el 55,99 % de
  Barcelona; 0,33–0,37 s por cálculo y 35 KB comprimidos (179 KB sin comprimir).
- El porcentaje es sobre superficie, no sobre población: Collserola, Montjuïc y el puerto
  cuentan como cualquier otra zona. Para hablar de población harían falta otros datos y otro
  modelo.
