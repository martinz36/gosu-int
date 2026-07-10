# Reglas de Proyecto: Entornos Seguros (Dev & Prod)

Este proyecto cuenta con dos ramas principales y entornos separados en Neon, Vercel y Railway:
- Rama `developer`: Conectada al entorno de desarrollo/pruebas.
- Rama `main`: Conectada al entorno de producción.

## Restricciones para el Agente:
1. **Verificación de Rama**: Antes de ejecutar migraciones de base de datos, construir el proyecto, o proponer despliegues, verifica siempre en qué rama de Git te encuentras utilizando `git branch --show-current`.
2. **Manejo de Secretos**: Nunca escribas ni persistas credenciales reales de producción en los archivos del código fuente. Usa archivos `.env.development` y `.env.production` localmente (los cuales deben estar en el `.gitignore`).
3. **Seguridad en Producción**:
   - Si estás en la rama `main`, tienes prohibido realizar pruebas destructivas, alterar datos de prueba o aplicar migraciones de base de datos de manera directa sin confirmación explícita del usuario.
   - Todo cambio crítico en producción debe ser primero probado y verificado en la rama `developer`.
4. **Despliegues**:
   - Para probar cambios, pídele al usuario hacer push a la rama `developer` para activar el pipeline de desarrollo en Railway/Vercel.
   - Para producción, los cambios deben fusionarse (merge) a la rama `main`.
