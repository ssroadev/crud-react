# PawHub

Aplicación React + Express + Supabase para administrar mascotas y perfiles profesionales de cuidadores.

## Preparación

1. En Supabase, ejecuta las migraciones pendientes de `backend/migrations` en orden: `001_caregiver_profiles.sql`, `002_caregiver_search.sql`, `003_registration_auth.sql`, `004_booking_requests.sql`, `005_caregiver_management.sql`, `006_booking_chat.sql` y `007_pet_breeds.sql`. La sexta añade las conversaciones privadas y la séptima crea y puebla el catálogo de razas. Si ya tienes las seis primeras, solo ejecuta la séptima. Usa las migraciones, no el esquema exportado de contexto.
2. Configura `backend/.env` con `SUPABASE_URL` y `SUPABASE_KEY`. Esta última debe ser una clave de servidor secret (`sb_secret_...`) o la compatible `service_role`; nunca la incluyas en el frontend. El puerto predeterminado es `3002`; puedes cambiarlo con `PORT`.
3. Ejecuta `npm ci` y `npm run dev` desde `backend`. El modo de desarrollo recarga el servidor al cambiar archivos del backend, `.env` o los catálogos de `shared`.
4. Ejecuta `npm ci` y `npm run dev` desde `frontend`. Abre `http://localhost:5173`. El frontend usa `http://localhost:3002`; configura `VITE_API_URL` si el backend usa otra URL.

## Formularios y razas de mascotas

Los formularios comparten campos con bordes suaves, estados de foco y error y selectores con menús propios. Los menús largos incluyen buscador; se puede navegar con flechas, elegir con Enter, salir con Tab y cerrar con Escape o al pulsar fuera. Los menús se ajustan a la pantalla y aparecen sobre las tarjetas para evitar recortes. Búsqueda, solicitudes y perfil profesional utilizan el mismo componente `Select`.

**Mis mascotas** presenta el formulario y las mascotas registradas en dos columnas; en móvil se apilan. El tamaño se elige con tarjetas de selección única. El formulario muestra errores por campo, evita envíos repetidos y conserva los datos cuando falla el guardado.

La migración `backend/migrations/007_pet_breeds.sql` crea `public.pet_breeds` con 61 opciones iniciales de perros, gatos y conejos. Se puede repetir sin duplicarlas y conserva las opciones que el administrador haya desactivado. El catálogo se consulta desde Express mediante `GET /pets/breeds`; solo devuelve filas con `active=true`. RLS impide el acceso directo con claves públicas; el backend usa su clave de servidor. Para agregar o desactivar razas, administra `id`, `species`, `name` y `active` en esa tabla.

La selección de raza permite buscar sin tildes y agrupa las opciones por especie. **Otra · indicar cuál** permanece disponible incluso cuando no hay coincidencias; al elegirla aparece **¿Cuál es su raza?**, obligatorio para esa opción. La raza puede dejarse sin especificar. Si falla la consulta del catálogo, se ofrece reintentar o guardar con Otra.

Al crear o editar, el frontend envía `breed_id` para una opción del catálogo o `breed_other` para una raza escrita. El backend obtiene el nombre de una opción activa desde la base; rechaza IDs inexistentes, razas inactivas y el envío simultáneo de ambas opciones. El nombre se guarda en `pets.breed`, conservando el modelo y los registros anteriores. Al editar una raza antigua ausente del catálogo se muestra Otra y se mantiene su texto. También se validan nombre, tamaño, fechas reales no futuras y notas de hasta 2000 caracteres. Se conserva la comprobación de propiedad de las mascotas.

Para activar el catálogo en Supabase, ejecuta el SQL de la séptima migración en su editor SQL y reinicia el backend si aún ejecuta una versión anterior. `SUPABASE_KEY` permite consultar y escribir filas por API, pero no ejecutar migraciones DDL. La migración se verifica en PostgreSQL local mediante PGlite durante las pruebas; esto no la aplica al Supabase real.

## Cuidadores de prueba

Desde `backend`, ejecuta `npm run seed:caregivers` para cargar ocho cuidadores ficticios en el Supabase configurado en `backend/.env`. Requiere las migraciones de preparación y una clave de servidor. El comando se rechaza si `NODE_ENV=production`.

La carga crea cuentas de Supabase Auth con rol `caregiver` y correo confirmado, y publica sus perfiles con servicios, tarifas en COP, coordenadas y horarios variados. Hay cuatro cuidadores en Bogotá, dos en Medellín y dos en Cali; se pueden consultar en **Encontrar cuidador** e iniciar sesión para administrar sus perfiles o responder solicitudes.

| Nombre | Correo de acceso | Zona |
| --- | --- | --- |
| Ana Torres | `ana.cuidadora@example.com` | Chapinero, Bogotá |
| Carlos Ramírez | `carlos.cuidador@example.com` | Usaquén, Bogotá |
| Laura Gómez | `laura.cuidadora@example.com` | Teusaquillo, Bogotá |
| Diego Castro | `diego.cuidador@example.com` | Suba, Bogotá |
| Sofía Martínez | `sofia.cuidadora@example.com` | Laureles, Medellín |
| Andrés Rojas | `andres.cuidador@example.com` | El Poblado, Medellín |
| Valentina Moreno | `valentina.cuidadora@example.com` | San Fernando, Cali |
| Mateo Vargas | `mateo.cuidador@example.com` | Ciudad Jardín, Cali |

La contraseña inicial de todas estas cuentas es `PawHubDemo2026!`; puedes definir `SEED_CAREGIVER_PASSWORD` en `backend/.env` antes de crearlas para usar otra. Los correos son ficticios y la carga administrativa no envía mensajes de confirmación.

El comando puede repetirse: conserva las contraseñas y los perfiles existentes, y completa los perfiles que falten. Solo reutiliza cuentas marcadas como pertenecientes a esta carga; si un correo ya pertenece a otra cuenta, se detiene antes de crear datos. Si falla a mitad del proceso, corrige la causa y repite el comando. Los datos están en `backend/seeds/caregivers.js`. Para probar **Crear cuenta**, usa un correo distinto de los ya cargados; las cuentas de esta tabla sirven para **Iniciar sesión**.

## Registro e inicio de sesión

Usa **Crear cuenta** (`#register`) o **Iniciar sesión** (`#login`) desde la cabecera. Se mantiene la distribución de la propuesta: formulario compacto a la izquierda y gato en círculo con su mensaje a la derecha. El retrato natural usa `frontend/public/images/pawhub-cat-cream.png`, con fondo crema claro similar al círculo original; se modificó únicamente el fondo del retrato anterior con imagegen. Su referencia y prompt están en [docs/assets/pawhub-cat-cream.md](docs/assets/pawhub-cat-cream.md). El panel conserva la textura y los tonos naranja y dorado de la propuesta, con turquesa en la parte inferior. La textura se muestra en escala de grises antes de mezclarla para eliminar su tinte azul. El turquesa compartido (`--accent: #087f8c`) unifica botones, enlaces y acentos del acceso, registro, perfiles y chat, con contraste suficiente para texto blanco. Los mensajes de éxito, avisos, estados aceptados/publicados, disponibilidad compatible y confirmaciones también usan la paleta turquesa; se sustituyeron los tonos verdes fijos de fondos, bordes, texto y sombras. Los errores y rechazos conservan sus tonos rojos, y las advertencias sus tonos cálidos. El logotipo se muestra como la imagen original, con sus colores naranja y turquesa, sin máscara ni filtro. En móvil la composición del gato aparece después del formulario. El registro mantiene su tarjeta y fotografía. Se reutilizan recursos visuales del ZIP, no sus scripts ni sus migraciones.

El **logo PawHub con el indicador Inicio** permite volver de inmediato a la página inicial desde el acceso y las páginas internas. Conserva la sesión y restablece la búsqueda de cuidadores, incluso si estabas editando el perfil profesional o consultando un perfil público. También se puede abrir directamente `#home`.

El registro pide nombre, apellido, correo, contraseña y confirmación; el teléfono es opcional. Por defecto se registra una cuenta de dueño, y también se permite elegir cuidador para usar el módulo profesional. Se comprueban campos obligatorios, formato del correo, teléfono, longitud de contraseña (8–128 caracteres), coincidencia de contraseñas y roles admitidos. Los errores se muestran junto al campo y el éxito tiene una pantalla de confirmación con los datos del perfil.

Las contraseñas se gestionan con [Supabase Auth](https://supabase.com/docs/reference/javascript/auth-signup); no se almacenan en las tablas públicas. El trigger de `003_registration_auth.sql` crea `public.users`, `public.profiles` y la membresía en `user_roles` en la misma transacción. Los únicos roles que puede asignar un registro son `owner` y `caregiver`. No se vinculan automáticamente cuentas antiguas solo por coincidencia de correo: una cuenta antigua debe enlazarse administrativamente con un usuario de Auth cuya identidad haya sido verificada, rellenando `users.auth_user_id` y asignando su rol, conservando el ID bigint y las mascotas.

### Configuración de Supabase

1. Aplica `003_registration_auth.sql` antes de probar el registro. No cambia los IDs de usuarios, perfiles ni mascotas existentes.
2. En **Authentication → Providers → Email**, habilita el acceso por correo y contraseña. El código respeta si tu proyecto exige confirmación de correo.
3. En **Authentication → URL Configuration**, configura Site URL como `http://localhost:5173` y agrega `http://localhost:5173/**` a las URL de redirección permitidas. En producción usa tu dominio HTTPS.
4. Configura `FRONTEND_URL=http://localhost:5173` en `backend/.env`; se usa para CORS y la vuelta desde el correo de confirmación. Tienes una plantilla en `backend/.env.example`.
5. `SUPABASE_KEY` debe ser la clave de servidor con acceso a las tablas protegidas. Puedes añadir `SUPABASE_ANON_KEY` para que las operaciones de Auth usen esa clave; si falta, se usa la de servidor en clientes aislados por operación. Ninguna clave se envía al navegador.

Si la confirmación está activa, el registro muestra **revisa tu correo** y no inicia sesión antes de verificarlo. Después de seguir el enlace, se vuelve al formulario de acceso. Los tokens que el enlace pueda incluir en el fragmento se descartan de la URL; el usuario inicia sesión con correo y contraseña. Si la confirmación está desactivada, se muestra el éxito del registro y **Entrar a PawHub** continúa con la sesión creada. Los mensajes incluyen credenciales incorrectas, correo sin confirmar, cuenta existente y límites de intentos. La entrega de correo depende del proveedor SMTP y de la configuración del proyecto.

### Sesión y propiedad de los datos

Express conserva los tokens en cookies **HttpOnly**, `SameSite=Lax`, con `Secure` en producción, sin usar localStorage. El navegador envía las cookies con `credentials: include`; el backend verifica la identidad con `auth.getUser`, renueva las sesiones expiradas y coordina renovaciones simultáneas. El cierre de sesión revoca la sesión de Supabase y borra las cookies. `GET /auth/session` restaura el acceso al recargar; **Mi perfil** permite actualizar los datos propios.

Las peticiones que modifican datos requieren JSON y rechazan orígenes distintos de `FRONTEND_URL`. El backend aplica un límite de 25 intentos de registro/acceso por IP cada diez minutos. Para una instalación con varios servidores, este contador y la coordinación de renovación deben compartirse.

Las mascotas ahora usan siempre `users.id` de la sesión como `pets.id_owner`: el cliente no puede elegir otro dueño. La edición de perfiles profesionales requiere el rol de cuidador y que `caregiver_profiles.profile_id` coincida con `account.profile.id`. Los selectores de otras cuentas se retiraron. La búsqueda y los perfiles publicados siguen disponibles para visitantes a través de Express. La migración activa RLS y retira el acceso directo de las claves públicas a las tablas del dominio; el backend consulta esas tablas con su clave de servidor y valida cada operación privada.

En producción, sirve frontend y API bajo el mismo sitio HTTPS (por ejemplo, `app.example.com` y `api.example.com`) para conservar las cookies `SameSite=Lax`; configura `NODE_ENV=production`, `FRONTEND_URL` y `VITE_API_URL` de forma coherente. Usa siempre el mismo host al desarrollar: `localhost` o `127.0.0.1` en ambos, sin mezclarlos.

| Método | Ruta | Función |
| --- | --- | --- |
| POST | `/auth/register` | Crea la cuenta y confirma el resultado |
| POST | `/auth/login` | Valida credenciales y crea la sesión |
| GET | `/auth/session` | Recupera la cuenta de la sesión, o `null` |
| POST | `/auth/logout` | Revoca la sesión y elimina las cookies |
| PUT | `/auth/profile` | Actualiza nombre, apellido, teléfono y presentación propios |

## Solicitar y responder un servicio

Desde **Cuidadores → Ver perfil completo**, el dueño puede elegir una mascota propia, un servicio ofrecido, fecha, hora de inicio y fin, ubicación y observaciones. Si llega desde una búsqueda con fecha y horario, esos valores se usan como punto de partida. Se muestra la duración calculada y un importe estimado. Si no hay sesión se invita a iniciar sesión; si no tiene mascotas se ofrece ir a registrarlas.

Al pulsar **Enviar solicitud al cuidador**, el servidor valida los obligatorios, que la mascota pertenezca a la cuenta, que el perfil esté publicado y activo, que el servicio exista y que la franja sea futura y esté cubierta por el horario publicado. La ubicación es obligatoria; las observaciones son opcionales, hasta 2000 caracteres. Se usa hora de Colombia y cada franja comienza y termina en la misma fecha.

La solicitud se guarda como `requested` (**Pendiente de respuesta**), y la confirmación de envío aclara que todavía no existe una reserva confirmada. Las solicitudes `requested` y las reservas `confirmed` bloquean horarios superpuestos; las franjas contiguas se permiten. Al rechazar, el horario queda libre. No se permiten solicitudes a la propia cuenta.

**Mis solicitudes** (`#requests`) muestra las enviadas. Una cuenta de cuidador también dispone de **Recibidas**, con la mascota, dueño, ubicación, horario y observaciones necesarios para responder. **Aceptar solicitud** cambia a `confirmed` solo después de volver a comprobar disponibilidad, actividad y servicio vigente. **Rechazar → Confirmar rechazo** cambia a `rejected` y permite explicar el motivo. Solo se puede responder una vez y únicamente desde la cuenta del cuidador destinatario. Una respuesta fallida deja la solicitud pendiente.

El dueño ve la respuesta y su mensaje en la misma sección, con un aviso destacado que puede marcar como leído. La lista se actualiza cada 30 segundos mientras está montada y al volver a la pestaña; también existe **Actualizar estados**. Los avisos se guardan en la base de datos y permanecen al recargar. Las notificaciones de esta historia son dentro de PawHub.

| Estado | Etiqueta | Significado |
| --- | --- | --- |
| `requested` | Pendiente de respuesta | Enviada; aún no es una reserva confirmada |
| `confirmed` | Confirmada | El cuidador aceptó |
| `rejected` | Rechazada | El cuidador no aceptó; la franja queda libre |
| `completed` | Finalizada / Completada | El cuidador cerró un servicio aceptado cuyo horario ya terminó |
| `cancelled` | Cancelada | Estado de reservas anteriores que se conserva |

La tarifa y su unidad se toman del perfil en el servidor y quedan registradas en la solicitud; no se acepta un importe enviado por el cliente. Las tarifas por hora se prorratean por duración. Para día, noche, paseo o visita, una solicitud incluye una unidad. El importe se conserva al aceptar aunque el precio publicado cambie. No se registra un cobro en este flujo.

### Integración con la base existente

`004_booking_requests.sql` añade a `bookings` el dueño, perfil público del cuidador, ubicación, observaciones, respuesta, tarifa pactada, duración y marcas de lectura. Relaciona reservas anteriores con el dueño de la mascota y con el perfil del cuidador cuando exista. Conserva los IDs y las claves foráneas originales.

Para perfiles nuevos, la solicitud crea de forma transaccional el registro que necesita `caregivers` y reutiliza o crea el catálogo de `services`. Se permiten coordenadas nulas en `caregivers` para no inventar ubicaciones; esos perfiles siguen sin aparecer en búsquedas por radio mientras no indiquen un punto de referencia. Las reservas anteriores que no se puedan asociar a un perfil profesional se muestran como historial y no presentan botones de respuesta.

La creación y revisión usan `pawhub_request_booking` y `pawhub_review_booking`, funciones de PostgreSQL con acceso exclusivo para el backend. Las operaciones bloquean el perfil durante la comprobación y escritura para serializar solicitudes del mismo cuidador. Así, la comprobación de disponibilidad y el guardado se realizan en una transacción. Los endpoints obtienen la identidad de la sesión y verifican propiedad en la base; un dueño no puede confirmar su propia solicitud ni seleccionar otra identidad en el cuerpo.

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/bookings?view=sent` | Solicitudes de las mascotas de la sesión |
| GET | `/bookings?view=received` | Solicitudes dirigidas al cuidador autenticado |
| POST | `/bookings` | Crea una solicitud pendiente |
| POST | `/bookings/:id/review` | Acepta o rechaza; requiere cuidador destinatario |
| POST | `/bookings/:id/read` | Marca la respuesta como leída por su dueño |

El cuerpo de creación usa `caregiver_profile_id`, `pet_id`, `service`, `date` (YYYY-MM-DD), `start_time`, `end_time` (HH:mm), `location` y `notes`. La revisión usa `decision` (`confirmed` o `rejected`) y `response_note` opcional. Conflictos de disponibilidad o decisiones repetidas devuelven HTTP 409; falta de propiedad o rol, 403/404. Los estados y etiquetas compartidos están en `shared/booking-statuses.json`.

## Administración de solicitudes del cuidador

Con una cuenta de cuidador, abre **Mis solicitudes → Recibidas**. El panel muestra un resumen de pendientes, aceptadas, rechazadas y completadas. Pulsar un contador aplica ese estado. Las solicitudes pendientes son la vista inicial; **Enviadas por mí** permite consultar los servicios que hayas solicitado para tus propias mascotas.

- **Solicitudes:** consulta y responde los servicios recibidos. Cada tarjeta presenta servicio, dueño, mascota, raza, tamaño, fecha de nacimiento si existe, información registrada de la mascota, ubicación y observaciones del servicio. La respuesta al dueño es opcional.
- **Agenda:** organiza por día únicamente los servicios aceptados. Los accesos **Hoy** y **Próximos 7 días** acotan las fechas; también puedes elegir un rango.
- **Historial:** reúne todos los estados, con filtros por mascota, dueño, servicio, número, fechas y orden. La búsqueda ignora diferencias entre mayúsculas y tildes. Se muestran hasta 12 registros por página.

El backend calcula `availability_check` para cada pendiente recibida usando el perfil, servicio, horario y reservas actuales. Si cambió la disponibilidad, el servicio ya no se ofrece, el perfil está inactivo o la fecha pasó, la tarjeta explica el motivo y deshabilita **Aceptar solicitud**; **Rechazar** sigue disponible. La función transaccional de la migración 004 vuelve a validar al aceptar, de modo que una comprobación de pantalla nunca sustituye la validación final del servidor.

Una acción válida actualiza el estado y los contadores inmediatamente con la respuesta del servidor y vuelve a consultar la lista. Los servicios aceptados se muestran como **Aceptada** al cuidador y **Confirmada** al dueño; las solicitudes pendientes conservan su estado hasta recibir respuesta. El registro desplegable conserva la fecha de solicitud y las marcas de respuesta y finalización disponibles.

### Completar un servicio

Después de su hora de fin, una reserva aceptada muestra **Marcar como completada → Confirmar finalización**. `005_caregiver_management.sql` añade `completed_at` y la función `pawhub_complete_booking`, accesible únicamente al backend. La función bloquea la reserva, comprueba el cuidador destinatario, exige estado `confirmed` y verifica que el horario terminó en hora de Colombia. No permite completar pendientes, rechazadas, reservas futuras ni reservas ajenas. Los servicios no se completan automáticamente por el paso del tiempo.

`POST /bookings/:id/complete` utiliza la identidad de la sesión y devuelve el registro actualizado, con estado `completed`. La reserva se conserva en el historial y el dueño recibe una actualización dentro de PawHub. Las respuestas no leídas se destacan y se priorizan en su orden predeterminado; el resumen **respuestas nuevas** permite encontrarlas aunque hubiera filtros activos. Las reservas completadas que ya existían no reciben una fecha de finalización inventada.

## Chat del servicio

En **Mis solicitudes**, cada tarjeta ofrece **Abrir chat del servicio** (`#chat/<id>`). El dueño y el cuidador destinatario pueden conversar desde cualquier estado, también desde el historial. El panel muestra a la otra persona, la mascota, el servicio y su estado; conversar no confirma una solicitud pendiente.

La migración `006_booking_chat.sql` guarda el historial en `booking_messages`. Cada mensaje muestra su contenido y hora de envío del servidor, con separadores de fecha y horarios de Colombia. Se cargan los últimos 50 mensajes y **Cargar mensajes anteriores** permite consultar los anteriores. Mientras la pestaña está visible, se consultan novedades cada tres segundos y al recuperar el foco o la conexión. Si estás leyendo mensajes anteriores, **Ver mensajes nuevos** permite bajar sin interrumpir la lectura.

Los mensajes admiten hasta 4000 caracteres y se muestran como texto. Si falla un envío, el texto permanece en una burbuja marcada **No se pudo enviar**, con **Reintentar envío**. Cada envío usa un UUID estable: un reintento devuelve el mensaje ya guardado si se perdió su respuesta, sin duplicarlo. Una consulta posterior también recupera esos mensajes. Los errores de conexión conservan el historial visible; cerrar o cambiar de conversación cancela las peticiones pendientes. No se muestran indicadores ficticios de presencia o lectura.

Solo el dueño registrado en la solicitud y el usuario del cuidador destinatario pueden leer o escribir. La identidad se obtiene de la sesión, nunca del cuerpo o de los parámetros del cliente, y se verifica en PostgreSQL en cada operación. La tabla y las funciones no están disponibles para claves públicas; únicamente el backend tiene acceso. Los envíos se serializan por solicitud para mantener el orden de entrega y se limitan a 30 nuevos mensajes por minuto y remitente en cada conversación; los reintentos de mensajes existentes no consumen ese límite.

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/bookings/:id/chat` | Conversación privada y últimos mensajes |
| GET | `/bookings/:id/chat?before_id=<id>&limit=50` | Mensajes anteriores en orden cronológico |
| GET | `/bookings/:id/chat?after_id=<id>&limit=100` | Novedades; `after_id=0` consulta desde el inicio |
| POST | `/bookings/:id/chat` | Envía `{ content, client_message_id }` y devuelve el mensaje guardado |

Las respuestas de lectura incluyen `booking`, `messages`, `has_older` y `has_more`. Los IDs se devuelven como cadenas para conservar la precisión de `bigint`. `after_id` y `before_id` son excluyentes y el límite es 1–100. Un acceso ajeno devuelve 404 sin revelar la existencia del chat; mensajes inválidos devuelven 400, un UUID reutilizado con otro contenido devuelve 409 y el límite de frecuencia devuelve 429. El chat usa consultas HTTP periódicas y no requiere WebSockets ni activar Supabase Realtime.

## Perfil de cuidador

Con una sesión de cuidador, entra en **Cuidadores → Administrar mi perfil profesional**, completa la información y guarda el borrador o publica. Se usa el perfil de tu sesión; una cuenta tiene un único perfil de cuidador y los siguientes guardados actualizan el mismo registro.

Para publicar son obligatorios la descripción, experiencia previa, años de experiencia (0–100), zona de cobertura, al menos una especie, un servicio con tarifa válida y un horario. Las especialidades y hasta seis fotografías por URL pública son opcionales. Las tarifas se expresan en COP por hora, día, noche, paseo o visita. Los horarios son semanales, en hora de Colombia, y no pueden superponerse ni cruzar la medianoche dentro de una misma franja.

La vista previa refleja los cambios antes de guardarlos. **Encontrar cuidador** muestra únicamente perfiles publicados. Guardar un perfil publicado como borrador lo retira de esa vista. Las validaciones del servidor también se aplican cuando se llama a la API directamente; un guardado inválido conserva la publicación anterior.

## Recomendaciones personalizadas

La página inicial reúne los criterios en un panel lateral y las recomendaciones en tarjetas con motivos de compatibilidad, tarifas y accesos a **Ver perfil** y **Solicitar servicio**. En móvil, **Personalizar mi búsqueda** despliega los filtros. La presentación comparte una paleta de turquesa, crema y neutros, navegación con la sección actual y estados de carga, error y búsqueda sin coincidencias.

El dueño puede seleccionar una mascota propia, confirmar su especie, marcar varias necesidades del catálogo y elegir servicio, ubicación, presupuesto y horario. Como `pets` no almacena especie, se confirma en cada búsqueda; no se adivina por la raza ni se interpretan notas como diagnósticos. Si existe fecha de nacimiento, para perros y gatos menores de un año se considera la especialidad **Cachorros**; desde siete años en perros y diez en gatos se considera **Mascotas mayores**. El resultado explica la necesidad añadida por edad. El tamaño se muestra como contexto: no se atribuye compatibilidad por tamaño porque los cuidadores no declaran tamaños admitidos.

Solo se consideran perfiles publicados y activos que atiendan la especie y ofrezcan el servicio solicitado. Las recomendaciones cumplen todas las necesidades, distancia, presupuesto y disponibilidad indicados. La franja debe estar cubierta por el horario semanal y libre de solicitudes pendientes y reservas confirmadas. Sin fecha, no se afirma disponibilidad; sin ubicación, no se afirma cercanía. Si un cuidador incumple alguno de estos criterios, puede consultarse en **Otros perfiles**, con avisos específicos, sin presentarse como coincidencia completa.

El orden predeterminado es determinista: especie aporta 30 puntos, servicio 25, cada especialidad coincidente 25, disponibilidad comprobada 30 y presupuesto compatible 10. La proximidad aporta hasta 20 puntos según la distancia dentro del radio; las valoraciones reales aportan hasta cinco puntos complementarios. Las reseñas nunca compensan una incompatibilidad para pasar a la lista de recomendaciones. A igualdad de puntuación se usa el número de reseñas y luego el ID para mantener un orden estable. No se muestran porcentajes de probabilidad ni calificaciones inventadas. Se puede cambiar el orden a cercanía, calificación o tarifa; la interfaz recuerda comparar una misma unidad para las tarifas.

Si hay menos de tres coincidencias en una búsqueda personalizada, se informa y se ofrecen acciones para ampliar el radio, buscar sin horario, consultar otros perfiles o explorar sin filtros. Ampliar distancia o quitar horario conserva la mascota, especie, servicio, necesidades y presupuesto ya enviados. Al visitar un perfil y volver se mantiene la búsqueda; el formulario de solicitud recibe la mascota, servicio y horario seleccionados. La solicitud sigue validándose en el servidor y requiere aceptación del cuidador.

`GET /caregivers/recommendations` devuelve `recommendations`, `alternatives`, `insufficient_matches` y `context`. Acepta los filtros de búsqueda y agrega `needs` (especialidades separadas por comas) y `pet_id` opcional. Usar `pet_id` requiere sesión: se consulta exclusivamente una mascota cuyo `id_owner` pertenece a esa sesión; una mascota ajena o inexistente devuelve 404 y sin sesión devuelve 401. Las respuestas no se almacenan en caché ni incluyen notas de mascotas o reservas privadas. No requiere migraciones nuevas ni servicios externos de IA.

## Buscar cuidadores

En **Encontrar cuidador**, usa **Usar mi ubicación** para pedir permiso al navegador, o escribe una ciudad, barrio o dirección, pulsa **Localizar** y selecciona una coincidencia. También puedes ingresar latitud y longitud manualmente. Si deniegas el permiso o falla el proveedor, la alternativa manual sigue disponible. La geolocalización del navegador necesita HTTPS o localhost y no se solicita automáticamente.

Combina distancia (1–200 km), servicio, especie, especialidad, precio mínimo y máximo, unidad de tarifa y disponibilidad por fecha y franja horaria. Pulsa **Buscar cuidadores** para aplicar los criterios o **Limpiar filtros** para restablecerlos. Los filtros de servicio, precio y unidad se aplican a una misma oferta; selecciona una unidad para comparar tarifas equivalentes. Puedes ordenar por cercanía, menor tarifa o mejor calificación.

La distancia aproximada se calcula en línea recta con la fórmula de Haversine, no por rutas de tránsito. Sin ubicación se listan todas las zonas; con ubicación se excluyen perfiles sin coordenadas. En **Administrar mi perfil**, el cuidador puede registrar y actualizar su punto de referencia. La API también reconoce las coordenadas de su registro existente en `caregivers`.

La disponibilidad usa el horario publicado en `caregiver_profiles.availability`, en hora de Colombia. Debe cubrir toda la franja seleccionada (se permiten franjas contiguas) y no coincidir con reservas `requested` o `confirmed` de `bookings`. Los intervalos que terminan justo al comenzar otro no se consideran conflicto. Cada consulta cubre una fecha y comienza y termina el mismo día.

Los resultados resumen nombre, zona, distancia cuando se puede calcular, especies, especialidades, servicios coincidentes y tarifas. Las calificaciones promedian las reseñas reales de reservas completadas, mediante `caregivers → bookings → reviews`; si no existen, se muestra **Sin calificaciones**. Solo se muestran perfiles publicados y se excluyen cuidadores cuyo registro existente tenga `active=false`.

**Ver perfil completo** abre `#cuidador/<id>`; se puede compartir el enlace y volver a los resultados conservando los filtros. Si no hay coincidencias, se informa y se ofrece limpiar los criterios.

### Búsqueda manual de lugares

Express consulta [Photon](https://github.com/komoot/photon/blob/master/docs/api-v1.md), que proporciona coordenadas a partir de datos de OpenStreetMap. La UI incluye atribución. El proveedor recibe el texto introducido únicamente al pulsar **Localizar**; la ubicación del navegador no se envía a ese proveedor. El servidor limita las consultas externas a una por segundo, conserva hasta 200 resultados de búsqueda en caché durante una hora y aplica un tiempo máximo de ocho segundos. Los fallos devuelven un mensaje que permite usar coordenadas manuales.

Por defecto se usa `https://photon.komoot.io/api/`. Su [servidor de demostración](https://github.com/komoot/photon#demo-server) admite uso moderado y no garantiza disponibilidad; configura `GEOCODING_URL` en el backend para usar una instancia Photon propia o compatible. Con varias instancias de Express, el límite y la caché deben compartirse o el geocodificador debe ser propio.

### API

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/caregivers` | Busca perfiles publicados y activos; devuelve una lista filtrada |
| GET | `/caregivers/:id` | Consulta un perfil publicado; 404 si no existe o es borrador |
| GET | `/caregivers/profile/:profileId` | Recupera el perfil para edición, o `null` si no se ha creado |
| PUT | `/caregivers/profile/:profileId` | Crea o actualiza el perfil de la cuenta; `status` es `draft` o `published` |
| GET | `/locations?q=Chapinero%2C%20Bogotá` | Obtiene hasta cinco ubicaciones para selección manual |

El cuerpo incluye `bio`, `experience`, `years_experience`, `zone`, `species`, `specialties`, `services` (`name`, `rate`, `unit`), `availability` (`day`: 0=domingo…6=sábado, `start` y `end`: HH:mm), `photos`, `status` y opcionalmente `latitude`, `longitude`, `location_name`. Las coordenadas se envían juntas como números o ambas como `null`. Los catálogos compartidos están en `shared/caregiver-options.json`. Los errores de validación devuelven HTTP 400 con un mensaje y `errors` por campo.

Parámetros de búsqueda: `latitude`, `longitude`, `radius_km` (0.1–200, predeterminado 10 con coordenadas), `service`, `species`, `specialty`, `min_price`, `max_price`, `rate_unit`, `date` (YYYY-MM-DD), `start_time` y `end_time` (HH:mm), `sort` (`distance`, `price`, `rating`). Fecha y ambas horas se envían juntas. Ejemplo: `/caregivers?latitude=4.65&longitude=-74.06&radius_km=5&service=Paseos&max_price=25000&rate_unit=paseo&date=2026-11-16&start_time=09:00&end_time=11:00`. Cada resultado agrega `distance_km`, `rating`, `review_count` y `matching_services`. Las reservas e identificadores internos usados para calcular disponibilidad y reseñas no se incluyen en el resultado.

### Alcance actual

La autenticación y la propiedad de los datos se verifican en Express. La clave de servidor permite consultar las tablas protegidas; no se expone en el frontend. La recuperación de contraseña, el acceso social y la administración de cuentas antiguas no forman parte de esta historia.

Las fotos se incorporan mediante enlaces; no se implementó un almacenamiento de archivos. Los modelos en `backend/models` son clases del dominio preexistentes; la API persiste los perfiles de esta historia en `caregiver_profiles`.

## Verificación

- Backend: `npm test` (validación, búsqueda, autenticación, permisos y rutas HTTP; las migraciones y reglas de solicitudes se ejecutan sobre PostgreSQL en memoria con PGlite, una dependencia de desarrollo). No se modifica el Supabase real al ejecutar las pruebas.
- Frontend: `npm run lint` y `npm run build`.
- Prueba manual con Supabase: guardar un borrador incompleto, recargar la cuenta, intentar publicar sin obligatorios, publicar un perfil completo, editar tarifas y disponibilidad, y volverlo a borrador. Comprobar que solo aparece públicamente mientras está publicado.
- Búsqueda: probar autorización y rechazo de geolocalización, seleccionar una ubicación manual, ajustar radio y filtros, comprobar el estado sin coincidencias y abrir/volver del perfil completo. Para las reservas, usar una franja que se superponga y otra que termine justo al comenzar una reserva confirmada.
- Registro/acceso: probar campos vacíos, correo inválido, contraseñas diferentes, registro exitoso con y sin confirmación de correo, credenciales incorrectas, actualización de perfil, recarga con sesión y cierre de sesión. Verificar que no se puedan administrar mascotas o perfiles de otra cuenta.
- Solicitudes: enviar una como dueño, comprobar que queda pendiente, abrir la cuenta del cuidador y aceptarla o rechazarla. Volver al dueño y actualizar los estados; comprobar el aviso y marcarlo como leído. Probar mascotas ajenas, horario superpuesto y un cambio de disponibilidad antes de aceptar.
- Administración: probar contadores y filtros de recibidas, agenda de aceptadas, búsqueda por nombre sin tildes, rangos de fecha e historial paginado. Completar una reserva aceptada ya terminada; comprobar que el backend rechaza completar una futura, pendiente o ajena. Verificar el regreso desde el logo sin perder la sesión.
- Chat: abrir la misma solicitud con el dueño y el cuidador en sesiones distintas, intercambiar mensajes y recargar para comprobar el historial. Consultar mensajes anteriores; cortar la conexión, enviar y reintentar al recuperarla. Verificar que una tercera cuenta no pueda consultar ni enviar y que conversar no cambie el estado de la solicitud. Las pruebas SQL verifican permisos, persistencia, paginación, reintentos y límite de envíos sin modificar Supabase.
