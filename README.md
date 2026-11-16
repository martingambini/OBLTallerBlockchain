# Taller de tecnologias 2 - Obligatorio Blockchain

## Descripcion
dApp de pagos salariales y vesting  con smart contracts en una red EVM. Un pagador crea un acuerdo para un beneficiario y deposita el monto total en un token ERC-20. El beneficiario reclama lo devengado con el paso del tiempo y, si el acuerdo es revocable, el pagador puede cancelarlo.

## Estructura

| Carpeta | Contenido |
|---|---|
| `contracts/` | `Vesting.sol`, `IVesting.sol`, `MockToken.sol` y contratos auxiliares de test en `contracts/test/` |
| `test/` | Tests con Mocha, Chai y ethers |
| `ignition/` | Módulo de despliegue de Hardhat Ignition |
| `scripts/` | Exportación de ABIs y direcciones, datos de ejemplo y avance de tiempo |
| `frontend/` | dApp en React, Vite, TypeScript y ethers.js |

## Requisitos

- Node.js 22 o superior (incluye npm)
- MetaMask instalado en el navegador

## 1. Instalar dependencias

Desde la raíz del proyecto:

```bash
npm install
```

Y para la dApp:

```bash
cd frontend
npm install
cd ..
```

Compilar los contratos:

```bash
npm run compile
```

## 2. Correr los tests

```bash
npm test
```

## 3. Generar coverage

```bash
npm run coverage
```

Muestra el porcentaje de líneas cubiertas por archivo. Los tests no necesitan el nodo local ni MetaMask.

Reporte de consumo de gas por función:

```bash
npm run gas
```

## 4. Desplegar los contratos en una red local

Terminal 1, nodo local de Hardhat (dejarla abierta):

```bash
npm run node
```

Imprime 20 cuentas de prueba con sus claves privadas, que son las públicas y conocidas de Hardhat.

Terminal 2, desde la raíz del proyecto:

```bash
npm run deploy:local
```

Despliega `MockToken` y `Vesting`, y escribe las direcciones y los ABIs en `frontend/src/contracts/` para que la dApp los use.

Opcional, crear acuerdos de ejemplo con la cuenta #0 como pagador:

```bash
npm run seed
```

## 5. Ejecutar la dApp

Terminal 3:

```bash
cd frontend
npm run dev
```

Abrir http://localhost:5173.

### Configurar MetaMask para la red local

1. Agregar una red con RPC `http://127.0.0.1:8545`, Chain ID `31337` y símbolo `ETH`.
2. Importar una o dos cuentas de la lista que imprime `npm run node` (por ejemplo la #0 como pagador y la #1 como beneficiario).
3. Si se reinicia el nodo, en MetaMask ir a Configuración, Avanzado y elegir "Borrar datos de la pestaña de actividad". Si no, aparecen errores de nonce.

### Uso básico

1. En **Crear acuerdo**, elegir "Usar token de prueba" y obtener OUSD de prueba con el botón de la pantalla.
2. Completar beneficiario, monto, fechas y si es revocable. La dApp pide primero `approve` y después crea el acuerdo.
3. **Acuerdos creados** lista los acuerdos donde la cuenta conectada es pagador y permite cancelar.
4. **Mis ingresos** lista los acuerdos donde la cuenta conectada es beneficiario y permite reclamar.
5. Al hacer clic en un acuerdo se abre su **detalle** con el historial de eventos.

### Adelantar el tiempo de la red local

Para ver el devengado avanzar sin esperar, adelantar N días (se mina un bloque nuevo):

PowerShell:

```powershell
$env:DAYS=4; npm run advance-time
```

Bash:

```bash
DAYS=4 npm run advance-time
```

## 6. Desplegar en Sepolia

La red de prueba pública ya tiene un despliegue verificado en Etherscan:

| Contrato | Dirección |
|---|---|
| `Vesting` | [`0x7d5e4103Fb09c70f205D0E986620b0bFC90eE7dB`](https://sepolia.etherscan.io/address/0x7d5e4103Fb09c70f205D0E986620b0bFC90eE7dB#code) |
| `MockToken` (OUSD) | [`0x5C760d8408278daa1CA1F4dEC1E73425dB0D1Aef`](https://sepolia.etherscan.io/address/0x5C760d8408278daa1CA1F4dEC1E73425dB0D1Aef#code) |

Para usar la dApp contra esas direcciones alcanza con cambiar la red de MetaMask a Sepolia. Las direcciones por red están en `frontend/src/contracts/deployments.json`.

Para repetir el despliegue con otra cuenta hacen falta SepoliaETH de un faucet y tres variables de configuración, que Hardhat guarda cifradas en su keystore y no en el repositorio:

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat keystore set ETHERSCAN_API_KEY
```

Después:

```bash
npm run deploy:sepolia
npm run verify:sepolia
```

`deploy:sepolia` despliega y actualiza `deployments.json`; `verify:sepolia` publica el código en Etherscan.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run compile` | Compila los contratos |
| `npm test` | Corre los tests |
| `npm run coverage` | Tests con reporte de cobertura |
| `npm run gas` | Tests con reporte de gas |
| `npm run node` | Nodo local de Hardhat |
| `npm run deploy:local` | Despliega en el nodo local y exporta ABIs y direcciones |
| `npm run seed` | Crea acuerdos de ejemplo en el nodo local |
| `npm run advance-time` | Adelanta el reloj del nodo local (`DAYS`) |
| `npm run deploy:sepolia` | Despliega en Sepolia |
| `npm run verify:sepolia` | Verifica los contratos en Etherscan |
| `cd frontend && npm run dev` | Levanta la dApp |
