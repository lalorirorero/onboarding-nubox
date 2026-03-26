-- Tabla principal para almacenar el estado de cada onboarding
CREATE TABLE IF NOT EXISTS onboardings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_zoho TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'en_progreso', 'completado')),
  datos_actuales JSONB NOT NULL,
  ultimo_paso INTEGER DEFAULT 0,
  navigation_history INTEGER[] DEFAULT ARRAY[0],
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fecha_ultima_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fecha_completado TIMESTAMP WITH TIME ZONE
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_onboardings_id_zoho ON onboardings(id_zoho);
CREATE INDEX IF NOT EXISTS idx_onboardings_estado ON onboardings(estado);
CREATE INDEX IF NOT EXISTS idx_onboardings_fecha_actualizacion ON onboardings(fecha_ultima_actualizacion DESC);

-- Comentarios para documentación
COMMENT ON TABLE onboardings IS 'Almacena el estado completo de cada proceso de onboarding';
COMMENT ON COLUMN onboardings.id IS 'UUID único usado como token en la URL';
COMMENT ON COLUMN onboardings.datos_actuales IS 'Estado actual del formulario (empresa, admins, trabajadores, etc.)';
COMMENT ON COLUMN onboardings.navigation_history IS 'Historial de pasos visitados para navegación "Atrás" correcta';
