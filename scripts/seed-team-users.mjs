import { sql } from "../api/_db.js";

const TEAM_USERS = [
  {
    id: "usr_valentin",
    google_id: "demo_valentin_01",
    email: "valentin.florez@crud-slack.internal",
    full_name: "Valentín Flórez Arbelaez",
    avatar_url: "https://api.dicebear.com/7.x/bottts/svg?seed=Valentin",
    status_text: "Coordinador General · Activo"
  },
  {
    id: "usr_ana",
    google_id: "demo_jacobo_02",
    email: "jacobo.florez@crud-slack.internal",
    full_name: "Jacobo Flórez Galeano",
    avatar_url: "https://api.dicebear.com/7.x/bottts/svg?seed=Jacobo",
    status_text: "Diseño UX/UI · Activo"
  },
  {
    id: "usr_carlos",
    google_id: "demo_edison_03",
    email: "edison.florez@crud-slack.internal",
    full_name: "Edison Flórez López",
    avatar_url: "https://api.dicebear.com/7.x/bottts/svg?seed=Edison",
    status_text: "Ingeniero Backend · Activo"
  },
  {
    id: "usr_elena",
    google_id: "demo_roberto_04",
    email: "roberto.urrea@crud-slack.internal",
    full_name: "Roberto Urrea",
    avatar_url: "https://api.dicebear.com/7.x/bottts/svg?seed=Roberto",
    status_text: "QA & Testing · Activo"
  }
];

async function seed() {
  console.log("Seeding 4 team users in Neon PostgreSQL...");
  for (const u of TEAM_USERS) {
    const query = `
      INSERT INTO users (id, google_id, email, full_name, avatar_url, status_text, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        google_id = EXCLUDED.google_id,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        status_text = EXCLUDED.status_text,
        last_seen_at = NOW()
      RETURNING id, full_name, email;
    `;
    const res = await sql(query, [u.id, u.google_id, u.email, u.full_name, u.avatar_url, u.status_text]);
    console.log("Seeded user:", res[0]);
  }

  const messages = [
    {
      id: "msg_init_01",
      channel_id: "c_general",
      user_id: "usr_valentin",
      text: "¡Hola equipo! Bienvenidos al espacio colaborativo de Slack. Tenemos 4 canales activos y conexión en tiempo real con IA para extraer tareas."
    },
    {
      id: "msg_init_02",
      channel_id: "c_general",
      user_id: "usr_ana",
      text: "¡Excelente Valentín! Acabo de revisar la integración de Slack Lists y la interfaz web sin dependencias. Todo fluye a la perfección."
    },
    {
      id: "msg_init_03",
      channel_id: "c_general",
      user_id: "usr_carlos",
      text: "Servidores en Neon PostgreSQL y Vercel operativos al 100%. Latencias menores a 100ms en el pipeline de sincronización."
    },
    {
      id: "msg_init_04",
      channel_id: "c_general",
      user_id: "usr_elena",
      text: "Genial. Recuerden que con el botón ⚡ Extraer a Slack Lists podemos convertir cualquier mensaje en tareas con prioridad y fechas."
    }
  ];

  for (const m of messages) {
    const q = `
      INSERT INTO messages (id, channel_id, user_id, text, created_at)
      VALUES ($1, $2, $3, $4, NOW() - INTERVAL '5 minute')
      ON CONFLICT (id) DO NOTHING;
    `;
    await sql(q, [m.id, m.channel_id, m.user_id, m.text]);
  }
  console.log("Seeded initial chat messages successfully.");
}

seed().catch(console.error);
