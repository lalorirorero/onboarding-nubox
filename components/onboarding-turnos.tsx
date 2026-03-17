"use client"

import React from "react"

import { useState, useEffect, useCallback, useRef } from "react" // Import useRef and useCallback
import {
  Building2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Shield,
  Rocket,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  Award,
  Heart,
  Zap,
  Check,
  Download,
} from "lucide-react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button" // Import added
// REMOVED: useSearchParams import as it's unreliable
import { useToast } from "@/components/ui/use-toast" // Added for toast notifications
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog" // Import Dialog components
import { useRouter } from "next/navigation" // Import useRouter

// REMOVED: PersistenceManager and persistence types
// quita // <-- This line was removed as it was identified as an undeclared variable in the updates.
const steps = [
  { id: 0, label: "Bienvenida", description: "Comienza aquí" },
  { id: 1, label: "Antes de comenzar", description: "Información del proceso" },
  { id: 2, label: "Empresa", description: "Datos base de la empresa" },
  { id: 3, label: "Administrador principal", description: "Quién administrará la plataforma" },
  { id: 4, label: "Carga de trabajadores", description: "Elige cómo agregar a tu equipo" }, // Actualizar array de steps
  { id: 5, label: "Trabajadores", description: "Listado inicial" },
  { id: 6, label: "Configuración de Turnos", description: "Decidir qué configurar" },
  { id: 7, label: "Turnos", description: "Definición de turnos" },
  { id: 8, label: "Planificaciones", description: "Tipos de planificación semanal" },
  { id: 9, label: "Asignaciones", description: "Asignar planificaciones a trabajadores" },
  { id: 10, label: "Resumen", description: "Revisión final" },
  { id: 11, label: "Agradecimiento", description: "¡Completado!" }, // Agregar paso de agradecimiento
]

const PRIMER_PASO = 0

// Días de la semana
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

// Define default turns (added because DEFAULT_TURNOS was undeclared)
const DEFAULT_TURNOS = [
  { id: -1, nombre: "Libre", horaInicio: "", horaFin: "", tipoColacion: "sin", colacionMinutos: 0, tooltip: "" },
  { id: -2, nombre: "Descanso", horaInicio: "", horaFin: "", tipoColacion: "sin", colacionMinutos: 0, tooltip: "" },
]

const TOOLTIP_GRUPO =
  '"Grupo" corresponde a una forma de clasificar a los colaboradores según características que tengan en común, como por ejemplo el lugar de trabajo, tipo de turno, área/departamento al que pertenece.'

const TOOLTIP_PERIODO_PLAN =
  "Estas fechas indican el periodo de vigencia de la planificación asignada a cada trabajador (por ejemplo, del 01-10 al 31-10)."

const stringifyPayload = (value: unknown, pretty = false) => {
  const json = typeof globalThis !== "undefined" ? globalThis.JSON : undefined
  const space = pretty ? 2 : undefined

  if (json && typeof json.stringify === "function") {
    return json.stringify(value, null, space)
  }

  if (typeof JSON !== "undefined" && typeof JSON.stringify === "function") {
    return JSON.stringify(value, null, space)
  }

  throw new Error("JSON.stringify no disponible en este entorno.")
}

const getEstadoByStep = (step) => {
  if (step >= 11) return "Completado"
  if (step <= 1) return "No iniciado"
  return "En Curso"
}


// Helpers de validación
const normalizeRut = (rut) => {
  if (!rut) return ""
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase()
}

const isRutFormatValid = (rut) => /^\d{7,8}-[0-9Kk]$/.test(rut.trim())



const isValidRut = (rut) => {
  const clean = normalizeRut(rut)
  if (!clean) return false
  if (!/^[0-9]+[0-9K]$/.test(clean)) return false

  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)
  let sum = 0
  let multiplier = 2

  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number.parseInt(body[i], 10) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }


  const mod = 11 - (sum % 11)
  let expected
  if (mod === 11) expected = "0"
  else if (mod === 10) expected = "K"
  else expected = String(mod)

  return dv === expected
}

const isValidEmail = (email) => {
  if (!email) return false
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email.trim())
}

const isValidPhone = (phone) => {
  if (!phone) return false
  const phoneRegex = /^\+?[0-9]{8,15}$/
  return phoneRegex.test(phone.replace(/\s/g, ""))
}

const normalizeGroupName = (value: string = "") => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

const MODULO_DASHBOARD_BI = "Dashboard BI"
const MODULO_DASHBOARD_BI_LEGACY = "Dasboard BI"

const normalizeModuloAdicional = (value: string = "") => {
  const normalized = value.trim()
  if (!normalized) return ""
  return normalized === MODULO_DASHBOARD_BI_LEGACY ? MODULO_DASHBOARD_BI : normalized
}

const normalizeModulosAdicionales = (values?: string[]) => {
  const normalizedValues = Array.isArray(values)
    ? values.map((value) => normalizeModuloAdicional(value || "")).filter((value) => value.length > 0)
    : []
  return Array.from(new Set(normalizedValues))
}

const normalizeEmpresaModulos = (empresa: any = {}) => ({
  ...empresa,
  modulosAdicionales: normalizeModulosAdicionales(empresa?.modulosAdicionales),
})

const validateEmpresaFields = (empresa: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!empresa.razonSocial?.trim()) errors.push("Razón Social")
  if (!empresa.nombreFantasia?.trim()) errors.push("Nombre de fantasía")
  if (!empresa.rut?.trim()) errors.push("RUT")
  if (empresa.rut?.trim()) {
    const rutRegex = /^[0-9]{7,8}-[0-9Kk]$/
    if (!rutRegex.test(empresa.rut.trim())) {
      errors.push("RUT (formato invalido)")
    }
  }
  if (!empresa.giro?.trim()) errors.push("Giro")
  if (!empresa.direccion?.trim()) errors.push("Dirección")
  if (!empresa.comuna?.trim()) errors.push("Comuna")
  if (!empresa.emailFacturacion?.trim()) errors.push("Email de facturación")
  if (!empresa.telefonoContacto?.trim()) errors.push("Teléfono de contacto")
  if (!empresa.rubro?.trim()) errors.push("Rubro")
  if (!empresa.sistema || empresa.sistema.length === 0) errors.push("Sistema de marcaje")
  if (Array.isArray(empresa.modulosAdicionales) && empresa.modulosAdicionales.includes("Otro")) {
    if (!empresa.modulosAdicionalesOtro?.trim()) {
      errors.push("Modulos adicionales (Otro)")
    }
  }

  // Validación de email
  if (empresa.emailFacturacion?.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(empresa.emailFacturacion)) {
      errors.push("Email de facturación (formato inválido)")
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

const validateAdminsFields = (admins: any[]): { isValid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!admins || admins.length === 0) {
    errors.push("Debe agregar al menos un administrador")
    return { isValid: false, errors }
  }

  admins.forEach((admin, index) => {
    const adminNum = index + 1
    if (!admin.nombre?.trim()) errors.push(`Administrador ${adminNum}: Nombre`)
    if (!admin.email?.trim()) errors.push(`Administrador ${adminNum}: Email`)
    else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(admin.email)) {
        errors.push(`Administrador ${adminNum}: Email (formato inválido)`)
      }
    }
    if (!admin.telefono?.trim()) errors.push(`Administrador ${adminNum}: Teléfono`)
  })

  return {
    isValid: errors.length === 0,
    errors,
  }
}

const Stepper = ({ currentStep }) => {
  return (
    <div className="relative w-full">
      <div className="overflow-x-auto pb-2">
        <ol className="flex gap-2 pr-10">
          {steps.map((step, index) => {
            const status = index < currentStep ? "completed" : index === currentStep ? "current" : "pending"

            const base =
              "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm bg-white min-w-[170px] max-w-[220px]"
            const stateClass =
              status === "current"
                ? "border-primary bg-primary/10"
                : status === "completed"
                  ? "border-success bg-success/10"
                  : "border-muted"

            return (
              <li key={step.id} className={`${base} ${stateClass}`}>
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold flex-shrink-0
                ${status === "current" ? "bg-primary text-primary-foreground" : ""}
                ${status === "completed" ? "bg-success text-success-foreground" : ""}
                ${status === "pending" ? "bg-muted text-muted-foreground" : ""}`}
                >
                  {status === "completed" ? "OK" : index + 1}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="font-medium text-foreground text-[11px] leading-tight whitespace-normal">
                    {step.label}
                  </div>
                  <div className="text-muted-foreground text-[9px] leading-tight whitespace-normal hidden lg:block">
                    {step.description}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-background to-transparent md:hidden">
        <div className="mr-1 flex h-7 w-7 items-center justify-center rounded-full border border-muted bg-white text-xs text-muted-foreground">
          {"\u203A"}
        </div>
      </div>
    </div>
  )
}

const AdminStep = ({ admins, setAdmins, onRemoveAdmin, isEditMode }) => {
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    rut: "",
    email: "",
    telefono: "",
  })

  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({})

  const handleFormChange = useCallback(
    (field, value) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      if (fieldErrors[field]) {
        setFieldErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors[field]
          return newErrors
        })
      }
    },
    [fieldErrors],
  )

  const validateAdminForm = useCallback(() => {
    const errors: { [key: string]: string } = {}

    if (!formData.nombre.trim()) {
      errors.nombre = "El nombre es obligatorio"
    }

    if (!formData.apellido.trim()) {
      errors.apellido = "El apellido es obligatorio"
    }

    if (!formData.rut.trim()) {
      errors.rut = "El RUT es obligatorio"
    } else {
      // Validar formato de RUT chileno
      const rutRegex = /^[0-9]{7,8}-[0-9Kk]$/
      if (!rutRegex.test(formData.rut)) {
        errors.rut = "Formato inválido (ej: 12345678-9)"
      }
    }

    if (!formData.email.trim()) {
      errors.email = "El correo es obligatorio"
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email)) {
        errors.email = "Formato de correo inválido (ej: correo@empresa.cl)"
      }
    }

    if (!formData.telefono.trim()) {
      errors.telefono = "El teléfono es obligatorio"
    } else {
      // Validar formato de teléfono (debe empezar con + y tener al menos 8 dígitos)
      const phoneRegex = /^\+?[0-9]{8,15}$/
      if (!phoneRegex.test(formData.telefono.replace(/\s/g, ""))) {
        errors.telefono = "Formato inválido (ej: +56912345678)"
      }
    }

    return errors
  }, [formData])

  const handleAddAdminClick = useCallback(() => {
    console.log("[v0] ===== BOTÓN AGREGAR ADMIN CLICKEADO (desde AdminStep) =====")

    const errors = validateAdminForm()

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const newAdmin = {
      id: Date.now(),
      nombre: `${formData.nombre.trim()} ${formData.apellido.trim()}`,
      apellido: formData.apellido.trim(),
      rut: formData.rut,
      email: formData.email,
      telefono: formData.telefono,
    }

    setAdmins([...admins, newAdmin])

    setFormData({
      nombre: "",
      apellido: "",
      rut: "",
      email: "",
      telefono: "",
    })
    setFieldErrors({})
  }, [formData, admins, setAdmins, validateAdminForm])

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Administrador de la plataforma</h2>
        <p className="mt-1 text-sm text-slate-600">
          El administrador ser&aacute; la persona principal encargada de GeoVictoria y tendr&aacute; acceso completo para gestionar la asistencia,
          configurar turnos, administrar trabajadores y revisar reportes de la empresa.
        </p>
        <p className="text-sm text-slate-500">
          Puede ser alguien de Recursos Humanos, Operaciones o quien liderar&aacute; el control de asistencia en el d&iacute;a a d&iacute;a.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Para acompa&ntilde;arlo en este proceso, el administrador contar&aacute; con un e-learning de incorporaci&oacute;n, donde aprender&aacute; paso a paso c&oacute;mo configurar la plataforma y comenzar a usarla de forma correcta y sencilla.
        </p>
      </header>

      {/* Formulario de nuevo administrador */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-medium text-slate-700">
          Datos del administrador <span className="text-destructive">*</span>
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Nombre <span className="text-destructive">*</span>
            </label>
            <input
              className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                fieldErrors.nombre
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                  : "border-slate-200 bg-white focus:border-sky-500 focus:ring-sky-500"
              }`}
              type="text"
              value={formData.nombre}
              onChange={(e) => handleFormChange("nombre", e.target.value)}
              placeholder="Ej: María"
            />
            {fieldErrors.nombre && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <span>⚠</span>
                {fieldErrors.nombre}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Apellido <span className="text-destructive">*</span>
            </label>
            <input
              className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                fieldErrors.apellido
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                  : "border-slate-200 bg-white focus:border-sky-500 focus:ring-sky-500"
              }`}
              type="text"
              value={formData.apellido}
              onChange={(e) => handleFormChange("apellido", e.target.value)}
              placeholder="Ej: González"
            />
            {fieldErrors.apellido && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <span>⚠</span>
                {fieldErrors.apellido}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              <span>
                RUT <span className="text-destructive">*</span>
              </span>
              <span className="ml-1 cursor-help text-slate-400" title="Ingresa el RUT sin puntos y con guión">
                ⓘ
              </span>
            </label>
            <input
              className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                fieldErrors.rut
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                  : "border-slate-200 bg-white focus:border-sky-500 focus:ring-sky-500"
              }`}
              type="text"
              value={formData.rut}
              onChange={(e) => handleFormChange("rut", e.target.value)}
              placeholder="Ej: 12345678-9"
            />
            {fieldErrors.rut && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <span>⚠</span>
                {fieldErrors.rut}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              <span>
                Correo <span className="text-destructive">*</span>
              </span>
              <span className="ml-1 cursor-help text-slate-400" title="Será usado para inicio de sesión">
                ⓘ
              </span>
            </label>
            <input
              className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                fieldErrors.email
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                  : "border-slate-200 bg-white focus:border-sky-500 focus:ring-sky-500"
              }`}
              type="email"
              value={formData.email}
              onChange={(e) => handleFormChange("email", e.target.value)}
              placeholder="Ej: correo@empresa.cl"
            />
            {fieldErrors.email && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <span>⚠</span>
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              <span>
                Teléfono <span className="text-destructive">*</span>
              </span>
              <span className="ml-1 cursor-help text-slate-400" title="Con código de país">
                ⓘ
              </span>
            </label>
            <input
              className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                fieldErrors.telefono
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                  : "border-slate-200 bg-white focus:border-sky-500 focus:ring-sky-500"
              }`}
              type="tel"
              value={formData.telefono}
              onChange={(e) => handleFormChange("telefono", e.target.value)}
              placeholder="Ej: +56912345678"
            />
            {fieldErrors.telefono && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <span>⚠</span>
                {fieldErrors.telefono}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleAddAdminClick}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
        >
          <span>+</span>
          Agregar administrador
        </button>
      </div>

      {/* Listado de administradores */}
      {admins.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-700">Administradores agregados ({admins.length})</h3>
          <div className="space-y-2">
            {admins.map((admin, index) => (
              <div
                key={admin.id || index}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{admin.nombre}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {admin.rut && <span>RUT: {admin.rut}</span>}
                    {admin.email && <span>{admin.email}</span>}
                    {admin.telefono && <span>{admin.telefono}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveAdmin(index)}
                  className="ml-2 text-xs text-destructive hover:text-error-foreground focus:outline-none"
                  title="Eliminar administrador"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {admins.length === 0 && (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
          <p className="text-sm font-medium text-amber-800">Debes agregar al menos un administrador</p>
          <p className="text-xs text-amber-600 mt-1">
            Completa el formulario arriba con todos los campos obligatorios (*)
          </p>
        </div>
      )}
    </section>
  )
}

const ProtectedInput = React.memo<{
  name: string
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  placeholder?: string
  error?: string // Nueva prop para mostrar error
}>(({ name, label, value, onChange, type = "text", placeholder, error }) => {
  const labelText = label.replace(/\s*\*$/, "")

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-2">
        {labelText}
        <span className="text-slate-900"> *</span>
      </label>
      <input
        type={type}
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full rounded-lg border ${
          error
            ? "border-red-500 focus:border-red-500 focus:ring-red-500"
            : "border-slate-300 focus:border-sky-500 focus:ring-sky-500"
        } px-4 py-2.5 focus:outline-none focus:ring-1`}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
})

ProtectedInput.displayName = "ProtectedInput"

const EmpresaStep = React.memo<{
  empresa: Empresa
  setEmpresa: (updater: Empresa | ((prev: Empresa) => Empresa)) => void
  prefilledFields: Set<string>
  isFieldPrefilled: (fieldKey: string) => boolean
  isFieldEdited: (fieldKey: string) => boolean
  trackFieldChange: (fieldKey: string, newValue: any) => void
  fieldErrors?: Record<string, string> // Nueva prop
}>(({ empresa, setEmpresa, prefilledFields, isFieldPrefilled, isFieldEdited, trackFieldChange, fieldErrors = {} }) => {
  const SISTEMAS = ["GeoVictoria BOX", "GeoVictoria CALL", "GeoVictoria APP", "GeoVictoria USB", "GeoVictoria WEB"]

  const SISTEMAS_INFO = {
    "GeoVictoria BOX": {
      imagen: "/images/box.png",
      titulo: "Relojes Biométricos",
      descripcion:
        "Dispositivos físicos con huella digital o reconocimiento facial. Ideal para oficinas, plantas y lugares con acceso fijo.",
    },
    "GeoVictoria CALL": {
      imagen: "/images/call.png",
      titulo: "Marcaje por Llamada",
      descripcion:
        "El trabajador marca llamando a un número gratuito. Ideal para personal en terreno sin smartphone o con baja conectividad.",
    },
    "GeoVictoria APP": {
      imagen: "/images/app.png",
      titulo: "Aplicación Móvil",
      descripcion:
        "App para smartphone con geolocalización y foto. Ideal para equipos en terreno, vendedores y personal móvil.",
    },
    "GeoVictoria USB": {
      imagen: "/images/usb.png",
      titulo: "Lector USB Biométrico",
      descripcion:
        "Lector de huella conectado a computador. Ideal para recepciones, escritorios compartidos o puestos de trabajo fijos.",
    },
    "GeoVictoria WEB": {
      imagen: "/images/web.png",
      titulo: "Portal Web",
      descripcion:
        "Marcaje desde el navegador con credenciales. Ideal para personal administrativo, teletrabajo y oficinas.",
    },
  }

  const MODULOS_ADICIONALES = [
    MODULO_DASHBOARD_BI,
    "Gestor Documental",
    "Planificador Inteligente",
    "Modulo de Alertas",
    "Permisos y Vacaciones",
    "Otro",
  ]

  const MODULOS_ADICIONALES_INFO: Record<
    string,
    {
      titulo: string
      categoria: string
      disponibilidad: string
      costo: string
      resumen: [string, string]
      descripcion: string
      incluye: string[]
    }
  > = {
    [MODULO_DASHBOARD_BI]: {
      titulo: "Dashboard BI",
      categoria: "Asistencia",
      disponibilidad: "Disponible",
      costo: "Costo adicional",
      resumen: [
        "Visualiza indicadores de asistencia y horas extra.",
        "Detecta tendencias para mejorar decisiones.",
      ],
      descripcion:
        "Visualiza y analiza los datos clave de asistencia, ausentismo y horas trabajadas desde una sola plataforma. Automatiza la generacion de indicadores, identifica tendencias operativas y mejora tu rentabilidad gracias a datos precisos y en tiempo real.",
      incluye: [
        "Graficos evolutivos sobre atrasos, horas extras y cumplimiento de jornada.",
        "Analisis de origen de horas extras y motivos mas frecuentes de permisos, por dia y por area.",
        "Personalizacion de indicadores y datos para reflejar las necesidades y KPI propios de cada empresa.",
      ],
    },
    "Gestor Documental": {
      titulo: "Gestor Documental",
      categoria: "Asistencia",
      disponibilidad: "Disponible",
      costo: "Costo adicional",
      resumen: [
        "Crea, envia y firma documentos laborales digitales.",
        "Controla pendientes y envia recordatorios.",
      ],
      descripcion:
        "Evita tener carpetas con papeles por anos guardados y perseguir fisicamente a tus trabajadores con el nuevo Gestor Documental de GeoVictoria. Facilita la administracion y firma de anexos, pactos y notificaciones para asegurar resguardo de documentos legales.",
      incluye: [
        "Crear documentos laborales propios, guardarlos como plantillas y enviarlos por correo a los trabajadores con pocos clics.",
        "Usar campos de los usuarios para autocompletar nombres, cargos y otras caracteristicas.",
        "Revisar que trabajadores aun no han firmado para enviarles un recordatorio.",
      ],
    },
    "Planificador Inteligente": {
      titulo: "Calendario Inteligente",
      categoria: "Asistencia",
      disponibilidad: "Beta",
      costo: "Costo adicional",
      resumen: [
        "Organiza turnos y ausencias en una sola vista.",
        "Ajusta dotacion rapido ante cambios operativos.",
      ],
      descripcion:
        "Con el Planificador Inteligente de GeoVictoria podras visualizar tu dotacion completa, asignar y modificar turnos en pocos clics, y anticiparte a cualquier incumplimiento operativo antes de que afecte el servicio. Todo en una sola plataforma, con control total y trazabilidad.",
      incluye: [
        "Revisar turnos y ausencias planificadas para tener claridad de la dotacion disponible.",
        "Asignar y modificar turnos de forma agil, adaptandose a cambios operativos.",
        "Crear y asignar planificadores para delegar y organizar la gestion.",
        "Gestionar alertas de incumplimiento operacional y actuar antes de que impacten el servicio.",
      ],
    },
    "Modulo de Alertas": {
      titulo: "Alertas",
      categoria: "Asistencia",
      disponibilidad: "Alta",
      costo: "Costo adicional",
      resumen: [
        "Recibe alertas de atrasos, inasistencias y horas extra.",
        "Actua a tiempo con notificaciones automaticas.",
      ],
      descripcion:
        "Anticipate a los problemas y toma decisiones rapidas con alertas inteligentes. Detecta atrasos, inasistencias o exceso de horas extras y recibe notificaciones automaticas por email.",
      incluye: [
        "Deteccion automatica de atrasos, inasistencias y exceso de horas extras.",
        "Notificaciones por email para actuar rapidamente frente a incumplimientos.",
        "Mayor control operativo para reducir costos y mejorar la gestion del equipo.",
      ],
    },
    "Permisos y Vacaciones": {
      titulo: "Permisos y Vacaciones",
      categoria: "Asistencia",
      disponibilidad: "Beta",
      costo: "Costo adicional",
      resumen: [
        "Gestiona permisos y vacaciones en linea.",
        "Cada colaborador ve su saldo en tiempo real.",
      ],
      descripcion:
        "Gestiona permisos y vacaciones de forma simple y automatica desde GeoVictoria. Tus equipos pueden solicitar, aprobar y visualizar sus dias disponibles en tiempo real, evitando demoras o correos interminables. Todo queda trazado, ordenado y sin errores de calculo.",
      incluye: [
        "Flujo de aprobacion en linea para vacaciones y permisos, con trazabilidad completa.",
        "Bolsa de vacaciones para que cada trabajador pueda ver en tiempo real sus dias disponibles.",
        "Solicitudes mas rapidas y simples, sin papeleo ni procesos manuales.",
      ],
    },
    Otro: {
      titulo: "Buscas otro modulo?",
      categoria: "Personalizado",
      disponibilidad: "Lo revisamos contigo",
      costo: "Cotizable",
      resumen: [
        "No ves el modulo que necesitas en el listado?",
        "Cuentanos cual buscas y te asesoramos.",
      ],
      descripcion:
        "Si no encuentras el modulo que necesitas, selecciona esta opcion y cuentanos cual te gustaria implementar. Nuestro equipo comercial y tecnico revisara tu caso para proponerte la mejor alternativa.",
      incluye: [
        "Solicita un modulo que no aparece en el listado.",
        "Completa el nombre del modulo que quieres cotizar.",
        "Recibe evaluacion comercial y tecnica personalizada.",
      ],
    },
  }

  const MODULOS_ADICIONALES_ICONOS: Record<string, React.ComponentType<{ className?: string }>> = {
    [MODULO_DASHBOARD_BI]: TrendingUp,
    "Gestor Documental": Shield,
    "Planificador Inteligente": Clock,
    "Modulo de Alertas": AlertCircle,
    "Permisos y Vacaciones": Heart,
    Otro: Rocket,
  }

  const RUBROS = [
    "1. Agrícola",
    "2. Condominio",
    "3. Construcción",
    "4. Inmobiliaria",
    "5. Consultoria",
    "6. Banca y Finanzas",
    "7. Educación",
    "8. Municipio",
    "9. Gobierno",
    "10. Mineria",
    "11. Naviera",
    "12. Outsourcing Seguridad",
    "13. Outsourcing General",
    "14. Outsourcing Retail",
    "15. Planta Productiva",
    "16. Logistica",
    "17. Retail Enterprise",
    "18. Retail SMB",
    "19. Salud",
    "20. Servicios",
    "21. Transporte",
    "22. Turismo, Hotelería y Gastronomía",
  ]

  const handleEmpresaChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target
      const nextValue = name === "rut" ? value.replace(/\./g, "").toUpperCase() : value
      setEmpresa((prev) => ({ ...prev, [name]: nextValue }))
      if (isFieldPrefilled(`empresa.${name}`)) {
        trackFieldChange(`empresa.${name}`, nextValue)
      }
    },
    [setEmpresa, isFieldPrefilled, trackFieldChange],
  )

  const handleSistemaChange = useCallback(
    (sistemaValue: string) => {
      setEmpresa((prev) => {
        const currentSistemas = prev.sistema || []
        const isSelected = currentSistemas.includes(sistemaValue)

        const newSistemas = isSelected
          ? currentSistemas.filter((s) => s !== sistemaValue)
          : [...currentSistemas, sistemaValue]

        if (isFieldPrefilled("empresa.sistema")) {
          trackFieldChange("empresa.sistema", newSistemas)
        }

        return { ...prev, sistema: newSistemas }
      })
    },
    [setEmpresa, isFieldPrefilled, trackFieldChange],
  )

  const handleModuloAdicionalChange = useCallback(
    (moduloValue: string) => {
      setEmpresa((prev) => {
        const currentModulos = normalizeModulosAdicionales(prev.modulosAdicionales)
        const normalizedModulo = normalizeModuloAdicional(moduloValue)
        const isSelected = currentModulos.includes(normalizedModulo)

        const newModulos = isSelected
          ? currentModulos.filter((m) => m !== normalizedModulo)
          : [...currentModulos, normalizedModulo]

        const shouldClearOtro = !newModulos.includes("Otro")

        if (isFieldPrefilled("empresa.modulosAdicionales")) {
          trackFieldChange("empresa.modulosAdicionales", newModulos)
        }

        if (shouldClearOtro && isFieldPrefilled("empresa.modulosAdicionalesOtro")) {
          trackFieldChange("empresa.modulosAdicionalesOtro", "")
        }

        return {
          ...prev,
          modulosAdicionales: newModulos,
          modulosAdicionalesOtro: shouldClearOtro ? "" : prev.modulosAdicionalesOtro || "",
        }
      })
    },
    [setEmpresa, isFieldPrefilled, trackFieldChange],
  )

  const ejecutivoWhatsapp = normalizeWhatsappNumber(empresa.ejecutivoTelefono)
  const empresaConsulta = empresa.nombreFantasia?.trim() || empresa.razonSocial?.trim() || "mi empresa"
  const ejecutivoConsulta = empresa.ejecutivoNombre?.trim() || "tu ejecutivo comercial"

  const getModuloWhatsAppLink = useCallback(
    (moduloKey: string, moduloPersonalizado?: string) => {
      if (!ejecutivoWhatsapp) return ""

      const saludo = `Hola ${ejecutivoConsulta}, soy de la empresa ${empresaConsulta}. Te escribo mientras estoy completando nuestro onboarding.`

      const mensajesPorModulo: Record<string, string> = {
        [MODULO_DASHBOARD_BI]:
          `${saludo} Quiero consultar el precio del modulo Dashboard BI y sus planes disponibles.`,
        "Gestor Documental":
          `${saludo} Quiero consultar el precio del modulo Gestor Documental y que incluye.`,
        "Planificador Inteligente":
          `${saludo} Quiero consultar el precio del modulo Planificador Inteligente y su alcance de implementacion.`,
        "Modulo de Alertas":
          `${saludo} Quiero consultar el precio del modulo de Alertas y como se habilita.`,
        "Permisos y Vacaciones":
          `${saludo} Quiero consultar el precio del modulo Permisos y Vacaciones y sus condiciones.`,
      }

      let text = mensajesPorModulo[moduloKey]

      if (moduloKey === "Otro") {
        const nombreModulo = moduloPersonalizado || "modulo personalizado"
        text = `${saludo} Quiero consultar el precio de un modulo no listado: ${nombreModulo}.`
      }

      if (moduloKey === "modulos adicionales") {
        text = `${saludo} Quiero cotizar modulos adicionales para potenciar nuestra implementacion.`
      }

      if (!text) {
        const fallbackModulo = moduloPersonalizado || moduloKey || "modulo adicional"
        text = `${saludo} Quiero consultar el precio del modulo ${fallbackModulo}.`
      }

      return `https://wa.me/${ejecutivoWhatsapp}?text=${encodeURIComponent(text)}`
    },
    [ejecutivoWhatsapp, ejecutivoConsulta, empresaConsulta],
  )

  const selectedModulos = normalizeModulosAdicionales(empresa.modulosAdicionales)


  return (
    <section className="space-y-6">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="mb-4 border-b border-slate-100 pb-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Building2 className="h-4 w-4 text-sky-500" />
            Datos de la empresa
          </h3>
          <p className="mt-1 text-sm text-slate-500">Completa la informacion base para continuar el onboarding.</p>
        </header>

      <div className="grid gap-6 md:grid-cols-2">
        <ProtectedInput
          name="razonSocial"
          label="Razón Social"
          placeholder="Ej: Tech Solutions S.A."
          value={empresa.razonSocial || ""}
          onChange={handleEmpresaChange}
          error={fieldErrors["empresa.razonSocial"]}
        />
        <ProtectedInput
          name="nombreFantasia"
          label="Nombre de fantasía"
          placeholder="Ej: TechSol"
          value={empresa.nombreFantasia || ""}
          onChange={handleEmpresaChange}
          error={fieldErrors["empresa.nombreFantasia"]}
        />
        <ProtectedInput
          name="rut"
          label="RUT *"
          placeholder="Ej: 12345678-9"
          value={empresa.rut || ""}
          onChange={handleEmpresaChange}
          error={fieldErrors["empresa.rut"]}
        />
        <ProtectedInput
          name="giro"
          label="Giro *"
          placeholder="Ej: Servicios de Tecnología"
          value={empresa.giro || ""}
          onChange={handleEmpresaChange}
          error={fieldErrors["empresa.giro"]}
        />
        <ProtectedInput
          name="direccion"
          label="Dirección"
          placeholder="Ej: Av. Principal 123"
          value={empresa.direccion || ""}
          onChange={handleEmpresaChange}
          error={fieldErrors["empresa.direccion"]}
        />
        <ProtectedInput
          name="comuna"
          label="Comuna *"
          placeholder="Ej: Santiago"
          value={empresa.comuna || ""}
          onChange={handleEmpresaChange}
          error={fieldErrors["empresa.comuna"]}
        />
        <ProtectedInput
          name="emailFacturacion"
          label="Email de facturación"
          type="email"
          placeholder="Ej: facturacion@empresa.com"
          value={empresa.emailFacturacion || ""}
          onChange={handleEmpresaChange}
          error={fieldErrors["empresa.emailFacturacion"]}
        />
        <ProtectedInput
          name="telefonoContacto"
          label="Teléfono de contacto"
          type="tel"
          placeholder="Ej: +56912345678"
          value={empresa.telefonoContacto || ""}
          onChange={handleEmpresaChange}
          error={fieldErrors["empresa.telefonoContacto"]}
        />
      </div>

      <div>
        <label htmlFor="rubro" className="block text-sm font-medium text-slate-700 mb-2">
          Rubro <span className="text-slate-900">*</span>
        </label>
        <select
          id="rubro"
          name="rubro"
          value={empresa.rubro || ""}
          onChange={handleEmpresaChange}
          className={`w-full rounded-lg border ${
            fieldErrors["empresa.rubro"] ? "border-red-500" : "border-slate-300"
          } px-4 py-2.5 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500`}
        >
          <option value="">Selecciona un rubro</option>
          {RUBROS.map((rubro) => (
            <option key={rubro} value={rubro}>
              {rubro}
            </option>
          ))}
        </select>
        {fieldErrors["empresa.rubro"] && <p className="mt-1 text-sm text-red-600">{fieldErrors["empresa.rubro"]}</p>}
      </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="mb-4 border-b border-slate-100 pb-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Clock className="h-4 w-4 text-sky-500" />
            Sistema de marcaje
          </h3>
          <p className="mt-1 text-sm text-slate-500">Selecciona el o los metodos que usara la empresa para marcar.</p>
        </header>

        <label className="block text-sm font-medium text-slate-700 mb-3">
          Sistema de marcaje <span className="text-slate-900">*</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SISTEMAS.map((sistema) => {
            const info = SISTEMAS_INFO[sistema]
            const isSelected = empresa.sistema?.includes(sistema)

            return (
              <button
                key={sistema}
                type="button"
                onClick={() => handleSistemaChange(sistema)}
                className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                  isSelected ? "border-sky-500 bg-sky-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 text-sm">{info.titulo}</h3>
                    <p className="mt-1 text-xs text-slate-600">{info.descripcion}</p>
                  </div>
                  <div
                    className={`ml-3 flex h-5 w-5 items-center justify-center rounded border-2 ${
                      isSelected ? "border-sky-500 bg-sky-500" : "border-slate-300"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        {fieldErrors["empresa.sistema"] && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-600 flex items-center gap-2">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              {fieldErrors["empresa.sistema"]}
            </p>
          </div>
        )}
      </article>

      <article id="modulos-adicionales-section" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="mb-4 border-b border-slate-100 pb-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Rocket className="h-4 w-4 text-sky-500" />
            Modulos adicionales
          </h3>
          <p className="mt-1 text-sm text-slate-500">Opcional: selecciona modulos para potenciar la implementacion.</p>
        </header>
        <div
          className={`mb-3 rounded-xl border p-3 ${
            (empresa.modulosAdicionales || []).length === 0 ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50"
          }`}
        >
          <div className="flex items-start gap-2">
            <Rocket
              className={`mt-0.5 h-4 w-4 ${
                (empresa.modulosAdicionales || []).length === 0 ? "text-amber-600" : "text-sky-600"
              }`}
            />
            <div className="space-y-1 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Potencia tu implementacion con modulos adicionales</p>
              <p>Selecciona los modulos que te interesan y te ayudamos a cotizar una solucion a tu medida.</p>
              <p>Si no encuentras el que necesitas, marca "Otro" y cuentanos cual te gustaria incorporar.</p>
              <p className="font-medium text-slate-800">El precio se consulta directo por WhatsApp con tu ejecutivo.</p>
              {ejecutivoWhatsapp && (
                <a
                  href={getModuloWhatsAppLink("modulos adicionales")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                  Consultar precio con mi ejecutivo
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS_ADICIONALES.map((modulo) => {
            const isSelected = selectedModulos.includes(modulo)
            const detalle = MODULOS_ADICIONALES_INFO[modulo]
            const ModuloIcon = MODULOS_ADICIONALES_ICONOS[modulo] || Zap

            return (
              <button
                key={modulo}
                type="button"
                onClick={() => handleModuloAdicionalChange(modulo)}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  isSelected ? "border-sky-500 bg-sky-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                      isSelected ? "border-sky-500 bg-white text-sky-600" : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    <ModuloIcon className="h-4 w-4" />
                  </div>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                      isSelected ? "border-sky-500 bg-sky-500" : "border-slate-300"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="font-semibold text-slate-800">{modulo}</p>
                  {detalle && (
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      <span className="block">{detalle.resumen[0]}</span>
                      <span className="block">{detalle.resumen[1]}</span>
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        {selectedModulos.length === 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Aun no seleccionas modulos adicionales. Elige uno para ver beneficios y funcionalidades.
          </div>
        )}

        {selectedModulos
          .filter((modulo) => MODULOS_ADICIONALES_INFO[modulo])
          .map((modulo) => {
            const detalle = MODULOS_ADICIONALES_INFO[modulo]
            const consultaNombre =
              modulo === "Otro" ? empresa.modulosAdicionalesOtro?.trim() || "modulo personalizado" : detalle.titulo
            const moduloWhatsAppLink = getModuloWhatsAppLink(modulo, consultaNombre)
            return (
              <article key={`detalle-${modulo}`} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-slate-900">{detalle.titulo}</h4>
                  <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-medium text-sky-700">
                    {detalle.categoria}
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    {detalle.disponibilidad}
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    {detalle.costo}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-slate-700">{detalle.descripcion}</p>

                {moduloWhatsAppLink ? (
                  <a
                    href={moduloWhatsAppLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <WhatsAppIcon className="h-3.5 w-3.5" />
                    Consultar precio con mi ejecutivo
                  </a>
                ) : (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Para consultar precio por WhatsApp necesitas un ejecutivo asignado en esta sesion.
                  </div>
                )}

                <p className="mt-4 text-sm font-semibold text-slate-800">{modulo === "Otro" ? "Como funciona" : "Incluye:"}</p>
                <ul className="mt-2 space-y-2 rounded-lg bg-white p-3 text-sm text-slate-700">
                  {detalle.incluye.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1 h-2 w-2 rounded-full bg-sky-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}

        {selectedModulos.includes("Otro") && (
          <div className="mt-3">
            <ProtectedInput
              name="modulosAdicionalesOtro"
              label="Que modulo te gustaria agregar?"
              placeholder="Ej: Control de accesos avanzado"
              value={empresa.modulosAdicionalesOtro || ""}
              onChange={handleEmpresaChange}
              error={fieldErrors["empresa.modulosAdicionalesOtro"]}
            />
          </div>
        )}
      </article>
    </section>
  )
})

EmpresaStep.displayName = "EmpresaStep"

class StepErrorBoundary extends React.Component<
  { onReset?: () => void; children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[v0] Error en paso de onboarding:", error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined })
    if (this.props.onReset) this.props.onReset()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Ocurri\u00f3 un error en este paso.</p>
          <p className="mt-1 text-xs">Puedes reintentar sin perder el resto del progreso.</p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

const TrabajadoresStep = ({
  trabajadores,
  setTrabajadores,
  grupos,
  setGrupos,
  ensureGrupoByName, // Agregado prop ensureGrupoByName
  errorGlobal,
  fieldErrors,
  formData,
}) => {
  const grupoIdCounter = useRef(Date.now())
  const [isFirstMount, setIsFirstMount] = useState(true)
  const [bulkText, setBulkText] = useState("")
  const [showVideoModal, setShowVideoModal] = useState(false) // Renamed from showExcelVideo
  const [bulkStatus, setBulkStatus] = useState({ total: 0, added: 0, error: "" })
  const MAX_ROWS = 500
  const [localFieldErrors, setLocalFieldErrors] = useState({ byId: {}, global: [] }) // Declare errors here
  const isCallSelected = (formData?.empresa?.sistema || []).includes("GeoVictoria CALL")
  const [showClearBulkModal, setShowClearBulkModal] = useState(false)
  const bulkWorkers = trabajadores.filter((t) => t.origen === "masivo" && t.tipo !== "administrador")
  const bulkWorkerCount = bulkWorkers.length
  const handleDownloadTemplate = () => {
    const headers = [
      "Rut Completo",
      "Correo Personal",
      "Nombres",
      "Apellidos",
      "Grupo",
      "Teléfono 1",
      "Teléfono 2",
      "Teléfono 3",
    ]

    const rows = [
      ["12345678-9", "ana.perez@empresa.cl", "Ana", "Pérez", "Operaciones", "+56912345678", "", ""],
      ["98765432-1", "luis.rojas@empresa.cl", "Luis", "Rojas", "Ventas Terreno", "+56998765432", "+56911112222", ""],
    ]

    const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
    dataSheet["!cols"] = [
      { wch: 14 },
      { wch: 26 },
      { wch: 16 },
      { wch: 16 },
      { wch: 20 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
    ]

    const instructions = [
      ["Instrucciones para usar la plantilla"],
      ["1) No cambies el orden de las columnas en la hoja Datos."],
      ["2) Completa cada fila con un trabajador (los encabezados ya están incluidos)."],
      ["3) RUT sin puntos y con guión (ej: 12345678-9)."],
      ["4) Grupo: etiqueta para clasificar trabajadores (ej: Operaciones, Tienda Centro, Turno Noche)."],
      ["5) Teléfono 1 es necesario para Marcaje por Llamada (marcaje telefónico). Si no lo tienes ahora, puedes completarlo después."],
      ["6) Teléfonos 2 y 3 son opcionales; si no tienes, deja la celda vacía."],
      ["7) Para cargar, copia y pega las filas (sin el encabezado) en el formulario."],
    ]

    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions)

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instrucciones")
    XLSX.utils.book_append_sheet(workbook, dataSheet, "Datos")

    XLSX.writeFile(workbook, "plantilla-trabajadores.xlsx")
  }


  useEffect(() => {
    if (isFirstMount) {
      setIsFirstMount(false)

      // Solo limpiar si NO hay grupos ni trabajadores cargados desde BD
      if (grupos.length === 0 && trabajadores.length === 0) {
        console.log("[v0] TrabajadoresStep mounted - Limpiando grupos previos (onboarding nuevo)")
        setGrupos([])
        grupoIdCounter.current = Date.now()
      } else {
        console.log(
          "[v0] TrabajadoresStep mounted - Manteniendo grupos existentes:",
          grupos.length,
          "grupos y",
          trabajadores.length,
          "trabajadores",
        )
      }
    }
  }, [isFirstMount, grupos.length, trabajadores.length, setGrupos])

  // Procesa pegado masivo y crea/reutiliza grupos por nombre normalizado
  useEffect(() => {
    try {
      const lines = bulkText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

    if (lines.length === 0) return

    if (lines.length > MAX_ROWS) {
      setBulkStatus({
        total: lines.length,
        added: 0,
        error: `Límite excedido. Máximo ${MAX_ROWS} filas por lote. Detectadas ${lines.length} filas.`,
      })
      return
    }

    setLocalFieldErrors({ byId: {}, global: [] })

    console.log("[v0] === INICIO DE PARSEO DE EXCEL ===")
    console.log("[v0] Total de líneas detectadas:", lines.length)

    const parsedLines = lines
      .map((line) => line.split(/\t|;|,/).map((c) => c.trim()))
      .filter((cols) => cols.some((c) => c.length > 0))
      .filter((cols) => {
        const first = (cols[0] || "").toLowerCase()
        const second = (cols[1] || "").toLowerCase()
        const fifth = (cols[4] || "").toLowerCase()
        const looksLikeHeader =
          first.includes("rut") || second.includes("correo") || fifth.includes("grupo") || first.includes("apellido")
        return !looksLikeHeader
      })

    console.log("[v0] Líneas parseadas (sin encabezados):", parsedLines.length)

    if (parsedLines.length === 0) {
      setBulkStatus({ total: 0, added: 0, error: "No se detectaron filas válidas para procesar." })
      return
    }

    if (parsedLines.length > MAX_ROWS) {
      setBulkStatus({
        total: parsedLines.length,
        added: 0,
        error: `Límite excedido. Máximo ${MAX_ROWS} filas por lote. Detectadas ${parsedLines.length} filas.`,
      })
      return
    }

    const nombreToId = new Map()

    console.log(
      "[v0] Primeras 5 líneas parseadas:",
      parsedLines.slice(0, 5).map((cols) => ({
        rut: cols[0],
        correo: cols[1],
        nombres: cols[2],
        apellidos: cols[3],
        grupo: cols[4],
      })),
    )

    const fieldErrorsById = {}
    const globalErrors = []
    let invalidCount = 0

    const nuevos = parsedLines.map((cols, index) => {
      const rutCompleto = cols[0] || ""
      const correoPersonal = cols[1] || ""
      const nombres = cols[2] || ""
      const apellidos = cols[3] || ""
      const grupoNombre = cols[4] || ""
      const telefono1 = cols[5] || ""
      const telefono2 = cols[6] || ""
      const telefono3 = cols[7] || ""

      const nombreCompleto = `${nombres} ${apellidos}`.trim()
      const id = Date.now() + index
      const rowErrors: Record<string, string> = {}

      if (!nombres.trim() || !apellidos.trim()) {
        rowErrors.nombre = "Nombre y apellido son obligatorios."
      }

      if (!rutCompleto.trim()) {
        rowErrors.rut = "El RUT es obligatorio."
      } else if (!isRutFormatValid(rutCompleto)) {
        rowErrors.rut = "RUT sin puntos y con guión (ej: 12345678-9)."
      } else if (!isValidRut(rutCompleto)) {
        rowErrors.rut = "RUT inválido."
      }

      if (!correoPersonal.trim()) {
        rowErrors.correo = "El correo es obligatorio."
      } else if (!isValidEmail(correoPersonal)) {
        rowErrors.correo = "Formato de correo inv?lido."
      }
      
      if (!grupoNombre.trim()) {
        rowErrors.grupoId = "El grupo es obligatorio."
      }
      
      if (telefono1.trim() && !isValidPhone(telefono1)) {
        rowErrors.telefono1 = "Formato de teléfono inválido."
      }

      if (telefono2.trim() && !isValidPhone(telefono2)) {
        rowErrors.telefono2 = "Formato de teléfono inválido."
      }

      if (telefono3.trim() && !isValidPhone(telefono3)) {
        rowErrors.telefono3 = "Formato de teléfono inválido."
      }

      if (Object.keys(rowErrors).length > 0) {
        fieldErrorsById[id] = rowErrors
        invalidCount += 1
      }

      let grupoId = ""
      if (grupoNombre) {
        const key = normalizeGroupName(grupoNombre)
        if (nombreToId.has(key)) {
          grupoId = nombreToId.get(key)
          console.log(`[v0] Grupo existente reutilizado: "${grupoNombre}" -> ID: ${grupoId}`)
        } else {
          const idObtenido = ensureGrupoByName(grupoNombre)
          grupoId = idObtenido
          nombreToId.set(key, idObtenido)
          console.log(`[v0] Nuevo grupo creado: "${grupoNombre}" -> ID: ${idObtenido}`)
        }
      }

      return {
        id,
        nombre: nombreCompleto,
        rut: rutCompleto,
        correo: correoPersonal,
        grupoId,
        grupoNombre: grupoNombre,
        telefono1,
        telefono2,
        telefono3,
        origen: "masivo",
        tipo: "usuario",
      }
    })

    console.log("[v0] === RESUMEN DE PROCESAMIENTO ===")
    console.log("[v0] Total de trabajadores procesados:", nuevos.length)
    console.log("[v0] Grupos únicos detectados:", nombreToId.size)
    console.log("[v0] Mapa de grupos:", Array.from(nombreToId.entries()))
    console.log(
      "[v0] Distribución de trabajadores por grupo:",
      nuevos.reduce((acc, t) => {
        const grupoNombre = parsedLines[nuevos.indexOf(t)][4] || "Sin grupo"
        acc[grupoNombre] = (acc[grupoNombre] || 0) + 1
        return acc
      }, {}),
    )

    if (invalidCount > 0) {
      globalErrors.push(
        `Se detectaron ${invalidCount} trabajador${invalidCount === 1 ? "" : "es"} con datos inválidos.`,
      )
    }

    setTrabajadores([...trabajadores, ...nuevos])
    setBulkStatus({
      total: lines.length,
      added: lines.length,
      error: globalErrors.join(" "),
    })
    setBulkText("")
      setLocalFieldErrors({ byId: fieldErrorsById, global: globalErrors })
    } catch (error) {
      console.error("[v0] Error procesando pegado masivo:", error)
      setBulkStatus({
        total: 0,
        added: 0,
        error: "Ocurrió un error al procesar la carga masiva. Reintenta.",
      })
      setLocalFieldErrors({ byId: {}, global: ["Ocurrió un error al procesar la carga masiva. Reintenta."] })
    }
  }, [bulkText, setBulkText, trabajadores, setTrabajadores, ensureGrupoByName, grupos, setGrupos, isCallSelected])

  const updateTrabajador = (id, field, value) => {
    const updated = trabajadores.map((t) => {
      if (t.id !== id) return t

      if (field === "grupoId") {
        const grupo = grupos.find((g) => String(g.id) === String(value))
        return { ...t, grupoId: value ? String(value) : "", grupoNombre: grupo?.nombre || "" }
      }

      if (field === "grupoNombre") {
        const grupoTexto = String(value || "")
        const existingGrupo = grupos.find((g) => normalizeGroupName(g.nombre) === normalizeGroupName(grupoTexto))
        return {
          ...t,
          grupoNombre: grupoTexto,
          grupoId: existingGrupo ? String(existingGrupo.id) : "",
        }
      }

      return { ...t, [field]: value }
    })
    setTrabajadores(updated)

    const errorField = field === "grupoNombre" ? "grupoId" : field
    if (localFieldErrors?.byId?.[id]?.[errorField]) {
      const newById = { ...(localFieldErrors.byId || {}) }
      const row = { ...(newById[id] || {}) }
      delete row[errorField]
      if (Object.keys(row).length === 0) {
        delete newById[id]
      } else {
        newById[id] = row
      }
      setLocalFieldErrors({ ...(localFieldErrors || { byId: {}, global: [] }), byId: newById })
    }
  }

  const commitTrabajadorGrupo = (id) => {
    const trabajador = trabajadores.find((t) => t.id === id)
    if (!trabajador) return

    const grupoDesdeId = grupos.find((g) => String(g.id) === String(trabajador.grupoId))
    const grupoIngresado = trabajador.grupoNombre?.trim() || grupoDesdeId?.nombre?.trim() || ""
    if (!grupoIngresado) {
      updateTrabajador(id, "grupoId", "")
      return
    }

    const existingGrupo = grupos.find((g) => normalizeGroupName(g.nombre) === normalizeGroupName(grupoIngresado))
    const grupoIdFinal = existingGrupo ? String(existingGrupo.id) : ensureGrupoByName(grupoIngresado)
    const grupoNombreFinal = existingGrupo?.nombre || grupoIngresado

    setTrabajadores((prev) =>
      prev.map((t) => (t.id === id ? { ...t, grupoId: grupoIdFinal, grupoNombre: grupoNombreFinal } : t)),
    )

    if (localFieldErrors?.byId?.[id]?.grupoId) {
      const newById = { ...(localFieldErrors.byId || {}) }
      const row = { ...(newById[id] || {}) }
      delete row.grupoId
      if (Object.keys(row).length === 0) {
        delete newById[id]
      } else {
        newById[id] = row
      }
      setLocalFieldErrors({ ...(localFieldErrors || { byId: {}, global: [] }), byId: newById })
    }
  }

  const addTrabajador = () => {
    setTrabajadores([
      ...trabajadores,
      {
        id: Date.now(),
        nombre: "",
        rut: "",
        correo: "",
        grupoId: "",
        grupoNombre: "",
        telefono1: "",
        telefono2: "",
        telefono3: "",
        origen: "manual",
        tipo: "usuario",
      },
    ])
  }

  const removeTrabajador = (id) => {
    const trabajador = trabajadores.find((t) => t.id === id)
    if (trabajador?.tipo === "administrador") {
      alert("No se puede eliminar un administrador desde aquí. Elimínalo desde el paso de Administradores.")
      return
    }
    setTrabajadores(trabajadores.filter((t) => t.id !== id))
    if (localFieldErrors?.byId?.[id]) {
      // errors is undeclared, this needs to be fixed.
      const newById = { ...(localFieldErrors.byId || {}) }
      delete newById[id]
      setLocalFieldErrors({ ...(localFieldErrors || { byId: {}, global: [] }), byId: newById }) // setErrors is undeclared, this needs to be fixed.
    }
  }


  const handleClearBulkWorkers = () => {
    if (bulkWorkerCount === 0) {
      setShowClearBulkModal(false)
      return
    }
    const bulkIds = new Set(bulkWorkers.map((t) => t.id))
    setTrabajadores(trabajadores.filter((t) => !bulkIds.has(t.id)))
    if (localFieldErrors?.byId) {
      const newById = { ...(localFieldErrors.byId || {}) }
      bulkIds.forEach((id) => {
        delete newById[id]
      })
      setLocalFieldErrors({ ...(localFieldErrors || { byId: {}, global: [] }), byId: newById })
    }
    setBulkStatus({ total: 0, added: 0, error: "" })
    setShowClearBulkModal(false)
  }
  const globalErrors = localFieldErrors?.global || []

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Trabajadores</h2>
        <p className="text-xs text-slate-500">
          Lista completa de trabajadores incluyendo administradores. Los usuarios se pueden agregar manualmente o
          mediante carga masiva.
        </p>
      </header>

      {globalErrors.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-[11px] text-red-800">
          <ul className="list-disc pl-4">
            {globalErrors.map((msg, idx) => (
              <li key={idx}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">Pegado masivo desde Excel</p>
            <p className="text-[11px] text-slate-500">
              Copia celdas desde Excel con las columnas en este orden:
              <span className="font-medium">
                {" "}
                Rut Completo, Correo Personal, Nombres, Apellidos, Grupo, Teléfono 1, Teléfono 2, Teléfono 3
              </span>
              . Se procesa automáticamente.
            </p>
            
            {isCallSelected ? (
              <p className="text-[11px] text-amber-700 mt-1">
                Marcaje por Llamada seleccionado: Teléfono 1 es necesario para el marcaje. Si no lo tienes ahora, podrás
                declararlo al continuar.
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 mt-1">
                Teléfono 1 es opcional si no usas Marcaje por Llamada.
              </p>
            )}

            <p className="text-[11px] text-amber-600 font-medium mt-1">
              Límite: {MAX_ROWS} filas por lote. Puedes pegar múltiples lotes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowVideoModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.841z" />
              </svg>
              Ver tutorial
            </button>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Descargar plantilla
            </button>
          </div>
        </div>

        {bulkStatus.error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-2.5">
            <div className="flex items-start gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-xs text-red-700">{bulkStatus.error}</p>
            </div>
          </div>
        )}

        {bulkStatus.added > 0 && !bulkStatus.error && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-2.5">
            <div className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 text-green-500"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-xs text-green-700 font-medium">
                ✓ {bulkStatus.added} trabajador{bulkStatus.added !== 1 ? "es" : ""} agregado
                {bulkStatus.added !== 1 ? "s" : ""} correctamente
              </p>
            </div>
          </div>
        )}

        <textarea
          className="mt-2 h-28 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-mono focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder={`Ejemplo de fila pegada:\n18371911-4\t correo@ejemplo.cl\tVICTOR MANUEL ALEJANDRO\tFLORES ESPEJO\tGTS\t+5691234567\t+5691234568\t+5691234569`}
          value={bulkText}
          onChange={(e) => {
            setBulkText(e.target.value)
            if (bulkStatus.error || bulkStatus.added > 0) {
              setBulkStatus({ total: 0, added: 0, error: "" })
            }
          }}
        />

        <div className="flex items-center justify-between pt-1 border-t border-slate-200">
          <p className="text-[11px] text-slate-600">
            Total de trabajadores: <span className="font-semibold text-slate-800">{trabajadores.length}</span>
          </p>
        </div>
      </div>

      <Dialog open={showClearBulkModal} onOpenChange={setShowClearBulkModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar trabajadores cargados masivamente</DialogTitle>
            <DialogDescription>
              Esta acci&oacute;n eliminar&aacute; {bulkWorkerCount} trabajador{bulkWorkerCount === 1 ? "" : "es"} importado{bulkWorkerCount === 1 ? "" : "s"}.
              Los trabajadores creados manualmente no se eliminar&aacute;n.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button type="button" variant="outline" onClick={() => setShowClearBulkModal(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleClearBulkWorkers}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showVideoModal && (
        <Dialog open={showVideoModal} onOpenChange={setShowVideoModal}>
          <DialogContent className="max-w-[1700px] w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
            <DialogHeader className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <DialogTitle className="text-lg font-semibold text-slate-900">Cómo pegar datos desde Excel</DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Tutorial paso a paso para importar trabajadores
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 text-xs space-y-2">
                <p className="font-semibold text-sky-900">Pasos para pegar desde Excel:</p>
                <ol className="list-decimal pl-5 space-y-1 text-sky-800">
                  <li>Selecciona las celdas en Excel con los datos de tus trabajadores</li>
                  <li>
                    Asegúrate de que las columnas estén en el orden correcto:{" "}
                    <span className="font-medium">
                      Rut Completo, Correo Personal, Nombres, Apellidos, Grupo, Teléfono 1, Teléfono 2, Teléfono 3
                    </span>
                  </li>
                  <li>Copia las celdas seleccionadas (Ctrl+C o Cmd+C)</li>
                  <li>Pega en el área de texto de arriba (Ctrl+V o Cmd+V)</li>
                  <li>Los trabajadores se agregarán automáticamente a la tabla</li>
                </ol>
                <p className="text-sky-700 italic mt-2">
                  Nota: Teléfono 1 es necesario para Marcaje por Llamada. Teléfonos 2 y 3 son opcionales.
                </p>
              </div>

              <div className="rounded-lg overflow-hidden bg-slate-900">
                <video controls className="w-full" src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/screen-capture%20%2845%29%20%28online-video-cutter.com%29%20%281%29-hWp1VhI7B4vhR7uue5IXg43PVpD92D.mp4">
                  Tu navegador no soporta la reproducción de videos.
                </video>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex justify-end">
              <Button type="button" onClick={() => setShowVideoModal(false)} variant="outline" className="rounded-lg">
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">Listado de trabajadores</p>
          <p className="text-[11px] text-slate-500">Elimina solo los trabajadores cargados masivamente.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">
            Importados: <span className="font-semibold text-slate-700">{bulkWorkerCount}</span>
          </span>
          <button
            type="button"
            onClick={() => setShowClearBulkModal(true)}
            disabled={bulkWorkerCount === 0}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Eliminar todos
          </button>
        </div>
      </div>

      <datalist id="grupos-existentes">
        {grupos.map((g) => (
          <option key={g.id} value={g.nombre} />
        ))}
      </datalist>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-700">Tipo</th>
              <th className="px-3 py-2 text-left font-medium text-slate-700">Nombre</th>
              <th className="px-3 py-2 text-left font-medium text-slate-700">RUT</th>
              <th className="px-3 py-2 text-left font-medium text-slate-700">Correo</th>
              <th className="px-3 py-2 text-left font-medium text-slate-700">
                <span className="inline-flex items-center gap-1">
                  Grupo
                  <span
                    className="cursor-help rounded-full border border-slate-300 px-1 text-[10px] text-slate-600"
                    title={TOOLTIP_GRUPO}
                  >
                    ?
                  </span>
                </span>
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-700">
                <span className="inline-flex items-center gap-1">
                  Teléfono 1
                  {isCallSelected && <span className="text-[10px] text-amber-700">(recomendado)</span>}
                </span>
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-700">Teléfono 2</th>
              <th className="px-3 py-2 text-left font-medium text-slate-700">Teléfono 3</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {trabajadores.map((t) => {
              const baseRowErrors = (localFieldErrors && localFieldErrors.byId && localFieldErrors.byId[t.id]) || {}
              const isAdmin = t.tipo === "administrador"
              const requiredErrors: Record<string, string> = {}
              
              if (!isAdmin) {
                const nombre = t.nombre?.trim() || ""
                const rut = t.rut?.trim() || ""
                const correo = t.correo?.trim() || ""
              
                if (!nombre) requiredErrors.nombre = "El nombre es obligatorio."
                if (!rut) requiredErrors.rut = "El RUT es obligatorio."
                else if (!isRutFormatValid(rut)) requiredErrors.rut = "RUT sin puntos y con gui?n (ej: 12345678-9)."
                else if (!isValidRut(rut)) requiredErrors.rut = "RUT inv?lido."
              
                if (!correo) requiredErrors.correo = "El correo es obligatorio."
                else if (!isValidEmail(correo)) requiredErrors.correo = "Formato de correo inv?lido."
              
                if (!t.grupoId) requiredErrors.grupoId = "El grupo es obligatorio."
              }
              
              const rowErrors = { ...requiredErrors, ...baseRowErrors }
              const telefono1FormatError =
                t.telefono1?.trim() && !isValidPhone(t.telefono1) ? "Formato de tel?fono inv?lido." : ""
              const telefono1Error = rowErrors.telefono1 || telefono1FormatError
              const rowErrorMessages = [
                ...Object.values(rowErrors),
                ...(telefono1FormatError && !rowErrors.telefono1 ? [telefono1FormatError] : []),
              ]
              const rowHasErrors = rowErrorMessages.length > 0

              return (
                <React.Fragment key={t.id}>
                  <tr
                    className={`border-t border-slate-100 ${
                      rowHasErrors ? "bg-red-50/70 ring-1 ring-inset ring-red-200" : isAdmin ? "bg-blue-50" : ""
                    }`}
                  >
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        isAdmin ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {isAdmin ? "Admin" : "Usuario"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={`w-full rounded-lg border px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                        rowErrors.nombre ? "border-red-400" : "border-slate-200"
                      } ${isAdmin ? "bg-blue-50" : ""}`}
                      type="text"
                      value={t.nombre}
                      onChange={(e) => updateTrabajador(t.id, "nombre", e.target.value)}
                      placeholder="Ej: Pedro Soto"
                      disabled={isAdmin}
                    />
                    {rowErrors.nombre && <p className="mt-0.5 text-[10px] text-red-600">{rowErrors.nombre}</p>}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={`w-full rounded-lg border px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                        rowErrors.rut ? "border-red-400" : "border-slate-200"
                      } ${isAdmin ? "bg-blue-50" : ""}`}
                      type="text"
                      value={t.rut}
                      onChange={(e) => updateTrabajador(t.id, "rut", e.target.value)}
                      placeholder="Ej: 18435922-7"
                      disabled={isAdmin}
                    />
                    {rowErrors.rut && <p className="mt-0.5 text-[10px] text-red-600">{rowErrors.rut}</p>}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={`w-full rounded-lg border px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                        rowErrors.correo ? "border-red-400" : "border-slate-200"
                      } ${isAdmin ? "bg-blue-50" : ""}`}
                      type="email"
                      value={t.correo}
                      onChange={(e) => updateTrabajador(t.id, "correo", e.target.value)}
                      placeholder="Ej: correo@empresa.cl"
                      disabled={isAdmin}
                    />
                    {rowErrors.correo && <p className="mt-0.5 text-[10px] text-red-600">{rowErrors.correo}</p>}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      list="grupos-existentes"
                      className={`w-full rounded-lg border px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                        rowErrors.grupoId ? "border-red-400" : "border-slate-200"
                      } ${isAdmin ? "bg-blue-50" : ""}`}
                      type="text"
                      value={t.grupoNombre || grupos.find((g) => String(g.id) === String(t.grupoId))?.nombre || ""}
                      onChange={(e) => updateTrabajador(t.id, "grupoNombre", e.target.value)}
                      onBlur={() => commitTrabajadorGrupo(t.id)}
                      placeholder="Ej: Operaciones"
                      disabled={isAdmin}
                    />
                    {rowErrors.grupoId && <p className="mt-0.5 text-[10px] text-red-600">{rowErrors.grupoId}</p>}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={`w-full rounded-lg border px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                        telefono1Error ? "border-red-400" : "border-slate-200"
                      } ${isAdmin ? "bg-blue-50" : ""}`}
                      type="tel"
                      value={t.telefono1 || ""}
                      onChange={(e) => updateTrabajador(t.id, "telefono1", e.target.value)}
                      placeholder="Ej: +5691234567"
                      disabled={isAdmin}
                    />
                    {telefono1Error && <p className="mt-0.5 text-[10px] text-red-600">{telefono1Error}</p>}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={`w-full rounded-lg border px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                        rowErrors.telefono2 ? "border-red-400" : "border-slate-200"
                      } ${isAdmin ? "bg-blue-50" : ""}`}
                      type="tel"
                      value={t.telefono2 || ""}
                      onChange={(e) => updateTrabajador(t.id, "telefono2", e.target.value)}
                      placeholder="Ej: +5691234567"
                      disabled={isAdmin}
                    />
                    {rowErrors.telefono2 && <p className="mt-0.5 text-[10px] text-red-600">{rowErrors.telefono2}</p>}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={`w-full rounded-lg border px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                        rowErrors.telefono3 ? "border-red-400" : "border-slate-200"
                      } ${isAdmin ? "bg-blue-50" : ""}`}
                      type="tel"
                      value={t.telefono3 || ""}
                      onChange={(e) => updateTrabajador(t.id, "telefono3", e.target.value)}
                      placeholder="Ej: +5691234567"
                      disabled={isAdmin}
                    />
                    {rowErrors.telefono3 && <p className="mt-0.5 text-[10px] text-red-600">{rowErrors.telefono3}</p>}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => removeTrabajador(t.id)}
                      className={`text-xs ${
                        isAdmin ? "cursor-not-allowed text-slate-300" : "text-slate-500 hover:text-red-500"
                      }`}
                      disabled={isAdmin}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
                {rowHasErrors && (
                  <tr className={rowHasErrors ? "bg-red-50/70" : ""}>
                    <td colSpan={9} className="px-3 pb-2 pt-0">
                      <div className="flex items-start gap-2 rounded-md bg-red-50 px-2 py-1 text-[10px] text-red-700">
                        <AlertCircle className="mt-0.5 h-3 w-3" />
                        <span>{rowErrorMessages.join(" | ")}</span>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addTrabajador}
        className="mt-2 inline-flex items-center rounded-full border border-sky-500 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
      >
        + Agregar trabajador
      </button>
    </section>
  )
}

const TurnosStep = ({ turnos, setTurnos }) => {
  const [formTurno, setFormTurno] = React.useState({
    nombre: "",
    horaInicio: "",
    horaFin: "",
    tipoColacion: "sin", // "sin", "libre", "fija"
    colacionMinutos: "", // Cambiado de 0 a "" para permitir borrar
    colacionInicio: "",
    colacionFin: "",
    tooltip: "",
  })

  const handleAddTurno = () => {
    // Validación básica
    if (!formTurno.nombre.trim()) {
      alert("Por favor ingresa el nombre del turno")
      return
    }

    if (formTurno.tipoColacion === "libre") {
      const minutos = Number(formTurno.colacionMinutos)
      if (!formTurno.colacionMinutos || Number.isNaN(minutos) || minutos <= 0) {
        alert("Debes ingresar los minutos de colación libre.")
        return
      }
    }

    if (formTurno.tipoColacion === "fija") {
      if (!formTurno.colacionInicio || !formTurno.colacionFin) {
        alert("Debes ingresar hora de inicio y fin para colación fija.")
        return
      }
    }

    // Agregar el nuevo turno
    setTurnos([
      ...turnos,
      {
        id: Date.now(),
        ...formTurno,
        colacionMinutos: formTurno.colacionMinutos === "" ? 0 : Number(formTurno.colacionMinutos),
      },
    ])

    // Limpiar el formulario
    setFormTurno({
      nombre: "",
      horaInicio: "",
      horaFin: "",
      tipoColacion: "sin",
      colacionMinutos: "", // Cambiado de 0 a ""
      colacionInicio: "",
      colacionFin: "",
      tooltip: "",
    })
  }

  const removeTurno = (id) => {
    setTurnos(turnos.filter((t) => t.id !== id))
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Turnos</h2>
        <div className="mt-2 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-sm font-medium text-blue-900">&iquest;Qu&eacute; es un turno?</p>
          <p className="text-xs text-blue-800 leading-relaxed">
            Un <strong>turno</strong> es un bloque de horario laboral con hora de inicio, hora de t&eacute;rmino y tiempo de
            colaci&oacute;n. Por ejemplo: "Turno Oficina" de 09:00 a 18:00 con 60 minutos de colaci&oacute;n, o "Turno Noche" de 22:00
            a 06:00 con 30 minutos de colaci&oacute;n.
          </p>
          <p className="text-xs text-blue-800 leading-relaxed">
            Ya tienes turnos base: <strong>Libre</strong> y <strong>Descanso</strong>.
            <strong>Descanso</strong> es recomendado para fines de semana o d&iacute;as no laborables, y <strong>Libre</strong> para
            personas sin horario fijo.
          </p>
          <p className="text-xs text-blue-800 leading-relaxed">
            En el siguiente paso crear&aacute;s <strong>planificaciones</strong> combinando estos turnos por d&iacute;a de la semana.
            Luego, en <strong>asignaciones</strong>, elegir&aacute;s qu&eacute; planificaci&oacute;n aplica a cada trabajador.
          </p>
        </div>
      </header>

      <div className="space-y-3 rounded-xl border-2 border-sky-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Agregar nuevo turno</h3>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1 text-sm">
            <label className="font-medium">Nombre del turno</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              type="text"
              value={formTurno.nombre}
              onChange={(e) => setFormTurno({ ...formTurno, nombre: e.target.value })}
              placeholder="Ej: Turno Oficina, Turno Noche"
            />
          </div>

          <div className="space-y-1 text-sm">
            <label className="font-medium">Hora inicio</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              type="time"
              value={formTurno.horaInicio}
              onChange={(e) => setFormTurno({ ...formTurno, horaInicio: e.target.value })}
            />
          </div>

          <div className="space-y-1 text-sm">
            <label className="font-medium">Hora fin</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              type="time"
              value={formTurno.horaFin}
              onChange={(e) => setFormTurno({ ...formTurno, horaFin: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="text-sm font-medium">Tipo de colación</label>
          <div className="grid gap-2 md:grid-cols-3">
            <button
              type="button"
              onClick={() => setFormTurno({ ...formTurno, tipoColacion: "sin", colacionMinutos: "" })}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                formTurno.tipoColacion === "sin"
                  ? "border-sky-500 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Sin Colación
            </button>
            <button
              type="button"
              onClick={() => setFormTurno({ ...formTurno, tipoColacion: "libre", colacionMinutos: "" })}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                formTurno.tipoColacion === "libre"
                  ? "border-sky-500 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Colación Libre
            </button>
            <button
              type="button"
              onClick={() => setFormTurno({ ...formTurno, tipoColacion: "fija", colacionMinutos: "" })}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                formTurno.tipoColacion === "fija"
                  ? "border-sky-500 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Colación Fija
            </button>
          </div>

          {formTurno.tipoColacion === "libre" && (
            <div className="space-y-1 text-sm">
              <label className="font-medium">Tiempo de colación (minutos)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                type="number"
                value={formTurno.colacionMinutos}
                onChange={(e) => setFormTurno({ ...formTurno, colacionMinutos: e.target.value })}
                placeholder="Ej: 30, 60"
                min="0"
              />
            </div>
          )}

          {formTurno.tipoColacion === "fija" && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 text-sm">
                <label className="font-medium">Inicio colación</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  type="time"
                  value={formTurno.colacionInicio}
                  onChange={(e) => setFormTurno({ ...formTurno, colacionInicio: e.target.value })}
                />
              </div>
              <div className="space-y-1 text-sm">
                <label className="font-medium">Término colación</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  type="time"
                  value={formTurno.colacionFin}
                  onChange={(e) => setFormTurno({ ...formTurno, colacionFin: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1 text-sm">
          <label className="font-medium">Descripción (opcional)</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            type="text"
            value={formTurno.tooltip}
            onChange={(e) => setFormTurno({ ...formTurno, tooltip: e.target.value })}
            placeholder="Ej: Fin de Semana o Feriado"
          />
        </div>

        <button
          type="button"
          onClick={handleAddTurno}
          className="w-full rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          Agregar turno
        </button>
      </div>

      {turnos.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Turnos disponibles ({turnos.length})</h3>
          <div className="space-y-2">
            {turnos.map((turno) => (
              <div
                key={turno.id}
                className="flex items-start justify-between rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">{turno.nombre}</h4>
                    {turno.tooltip && <span className="text-xs text-slate-500">({turno.tooltip})</span>}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    {turno.horaInicio && turno.horaFin && (
                      <span>
                        <strong>Horario:</strong> {turno.horaInicio} - {turno.horaFin}
                      </span>
                    )}
                    {turno.tipoColacion === "sin" && (
                      <span>
                        <strong>Colación:</strong> Sin colación
                      </span>
                    )}
                    {turno.tipoColacion === "libre" && turno.colacionMinutos > 0 && (
                      <span>
                        <strong>Colación libre:</strong> {turno.colacionMinutos} min
                      </span>
                    )}
                    {turno.tipoColacion === "fija" && turno.colacionInicio && turno.colacionFin && (
                      <span>
                        <strong>Colación fija:</strong> {turno.colacionInicio} - {turno.colacionFin}
                      </span>
                    )}
                  </div>
                </div>
                {["libre", "descanso"].includes((turno.nombre || "").toLowerCase()) ? null : (
                  <button
                    type="button"
                    onClick={() => removeTurno(turno.id)}
                    className="text-xs text-slate-500 hover:text-red-500"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

const GruposStep = ({ grupos, setGrupos }) => {
  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
  })

  const handleFormChange = useCallback(
    (field, value) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
    },
    [setFormData],
  ) // Added setFormData to dependencies

  const addGrupo = () => {
    if (!formData.nombre.trim()) {
      alert("Por favor ingresa el nombre del grupo")
      return
    }

    setGrupos([
      ...grupos,
      {
        id: Date.now(),
        nombre: formData.nombre,
        descripcion: formData.descripcion,
      },
    ])

    // Limpiar el formulario
    setFormData({
      nombre: "",
      descripcion: "",
    })
  }

  const removeGrupo = (id) => {
    setGrupos(grupos.filter((g) => g.id !== id))
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Grupos</h2>
        <p className="text-xs text-slate-500">
          Organiza a tus trabajadores en grupos por equipos, sucursales o departamentos.
        </p>
      </header>

      {/* Formulario único */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-medium text-slate-700 mb-3">Agregar Grupo</h3>
        <div className="space-y-3">
          <div className="space-y-1 text-sm">
            <label className="font-medium">Nombre del grupo</label>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              type="text"
              value={formData.nombre}
              onChange={(e) => handleFormChange("nombre", e.target.value)}
              placeholder="Ej: Ventas, Bodega, Sucursal Centro"
            />
          </div>
          <div className="space-y-1 text-sm">
            <label className="font-medium">Descripción (opcional)</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={formData.descripcion}
              onChange={(e) => handleFormChange("descripcion", e.target.value)}
              placeholder="Ej: Equipo de ventas de la región metropolitana"
              rows={2}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={addGrupo}
          className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
        >
          + Agregar grupo
        </button>
      </div>

      {/* Listado de grupos */}
      {grupos.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-700">Grupos creados ({grupos.length})</h3>
          <div className="space-y-2">
            {grupos.map((grupo) => (
              <div
                key={grupo.id}
                className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900">{grupo.nombre}</div>
                  {grupo.descripcion && <div className="mt-1 text-xs text-slate-500">{grupo.descripcion}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => removeGrupo(grupo.id)}
                  className="ml-2 text-xs text-red-500 hover:text-red-700 focus:outline-none"
                  title="Eliminar grupo"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {grupos.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-500">No hay grupos creados aún</p>
          <p className="text-xs text-slate-400 mt-1">Completa el formulario arriba para agregar el primer grupo</p>
        </div>
      )}
    </section>
  )
}

const PlanificacionesStep = ({ planificaciones, setPlanificaciones, turnos }) => {
  const [formData, setFormData] = useState({
    nombre: "",
    diasTurnos: Array(7).fill(null),
  })

  const handleFormChange = useCallback(
    (field, value) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
    },
    [setFormData],
  )

  const updateDiaTurno = useCallback(
    (dayIndex, turnoId) => {
      setFormData((prev) => {
        const nuevosDias = [...prev.diasTurnos]
        nuevosDias[dayIndex] = turnoId
        return { ...prev, diasTurnos: nuevosDias }
      })
    },
    [setFormData],
  ) // Added setFormData to dependencies

  const addPlanificacion = useCallback(() => {
    if (!formData.nombre.trim()) {
      alert("Por favor ingresa el nombre de la planificación")
      return
    }

    const esCompleta = formData.diasTurnos.every((turnoId) => turnoId !== null && turnoId !== "")
    if (!esCompleta) {
      alert("Por favor asigna un turno a todos los días de la semana")
      return
    }

    setPlanificaciones([
      ...planificaciones,
      {
        id: Date.now(),
        nombre: formData.nombre,
        diasTurnos: formData.diasTurnos,
      },
    ])

    // Limpiar el formulario
    const defaultTurno =
      turnos.find((t) => t.nombre.toLowerCase() === "libre" || t.nombre.toLowerCase() === "descanso") || turnos[0]
    const defaultTurnoId = defaultTurno ? defaultTurno.id : null

    setFormData({
      nombre: "",
      diasTurnos: Array(7).fill(defaultTurnoId),
    })
  }, [formData, planificaciones, setPlanificaciones, turnos])

  const removePlanificacion = useCallback(
    (id) => {
      setPlanificaciones((prev) => prev.filter((p) => p.id !== id))
    },
    [setPlanificaciones],
  )

  const verificarPlanificacionCompleta = useCallback((diasTurnos) => {
    return diasTurnos.every((turnoId) => turnoId !== null && turnoId !== "")
  }, [])

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Planificaciones</h2>
        <div className="mt-2 space-y-2 rounded-lg border border-purple-200 bg-purple-50 p-3">
          <p className="text-sm font-medium text-purple-900">¿Qué es una planificación?</p>
          <p className="text-xs text-purple-800 leading-relaxed">
            Una <strong>planificación</strong> es un patrón semanal que combina los turnos que creaste en el paso
            anterior. Define qué turno se trabaja cada día de la semana (Lunes a Domingo).
          </p>
          <p className="text-xs text-purple-800 leading-relaxed">
            <strong>Ejemplo:</strong> Puedes crear una planificación llamada "Oficina 5x2" donde de Lunes a Viernes
            asignas "Turno Oficina" y Sábado y Domingo asignas "Libre". O una planificación "Rotativo" con diferentes
            turnos cada día.
          </p>
          <p className="text-xs text-purple-800 leading-relaxed">
            <strong>Relación con turnos:</strong> Cada día de la planificación usa uno de los turnos que definiste
            anteriormente. Las planificaciones te permiten crear patrones semanales reutilizables que luego asignarás a
            tus trabajadores.
          </p>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">


      {turnos.length === 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          Primero debes crear al menos un turno en el paso anterior.
        </div>
      )}

      {/* Formulario único */}
      {turnos.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Agregar Planificación</h3>
          <div className="space-y-3">
            <div className="space-y-1 text-sm">
              <label className="font-medium">Nombre de la planificación</label>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                type="text"
                value={formData.nombre}
                onChange={(e) => handleFormChange("nombre", e.target.value)}
                placeholder="Ej: Lunes a Viernes Oficina, Fin de semana Libre"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Asignación semanal (L, M, X, J, V, S, D)</p>
              <div className="grid gap-2 sm:grid-cols-7">
                {DIAS.map((dia, dayIndex) => {
                  const turnoAsignado = formData.diasTurnos[dayIndex]
                  return (
                    <div key={dayIndex} className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">{dia}</label>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        value={turnoAsignado ?? ""}
                        onChange={(e) => updateDiaTurno(dayIndex, e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Seleccionar</option>
                        {turnos.map((turno) => (
                          <option key={turno.id} value={turno.id}>
                            {turno.nombre || "Sin nombre"}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="text-xs">
              {verificarPlanificacionCompleta(formData.diasTurnos) ? (
                <span className="text-emerald-700 font-medium">✓ Planificación completa</span>
              ) : (
                <span className="text-amber-700 font-medium">⚠ Todos los días deben tener un turno asignado</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={addPlanificacion}
            className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            + Agregar planificación
          </button>
        </div>
      )}

      {/* Listado de planificaciones */}
      {planificaciones.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-700">Planificaciones creadas ({planificaciones.length})</h3>
          <div className="space-y-3">
            {planificaciones.map((plan) => {
              const esCompleta = verificarPlanificacionCompleta(plan.diasTurnos)
              return (
                <div key={plan.id} className="rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{plan.nombre}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {esCompleta ? (
                          <span className="text-emerald-700 font-medium">✓ Completa</span>
                        ) : (
                          <span className="text-amber-700 font-medium">⚠ Incompleta</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePlanificacion(plan.id)}
                      className="text-xs text-red-500 hover:text-red-700 focus:outline-none"
                      title="Eliminar planificación"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-[10px]">
                    {DIAS.map((dia, dayIndex) => {
                      const turnoId = plan.diasTurnos[dayIndex]
                      const turno = turnos.find((t) => t.id === turnoId)
                      return (
                        <div key={dayIndex} className="text-center">
                          <div className="font-medium text-slate-600 mb-0.5">{dia}</div>
                          <div className="rounded bg-slate-100 px-1 py-0.5 text-slate-700">{turno?.nombre || "-"}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {planificaciones.length === 0 && turnos.length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-500">No hay planificaciones creadas aún</p>
          <p className="text-xs text-slate-400 mt-1">
            Completa el formulario arriba para agregar la primera planificación
          </p>
        </div>
      )}

        </div>
        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">Turnos creados</h3>
            <p className="text-[11px] text-slate-500 mt-1">Creados en el paso anterior</p>
            {turnos.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">A&uacute;n no hay turnos creados.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {turnos.map((turno) => {
                  const nombre = turno.nombre || "Sin nombre"
                  const nombreLower = nombre.toLowerCase()
                  const isBase = nombreLower === "libre" || nombreLower === "descanso"
                  const horario = turno.horaInicio && turno.horaFin ? `${turno.horaInicio} - ${turno.horaFin}` : "Sin horario"
                  return (
                    <li key={turno.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800">{nombre}</span>
                        {isBase && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            Base
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">{horario}</p>
                      <p className="text-[11px] text-slate-500">
                        {turno.tipoColacion === "libre" ? (
                          <span>{turno.colacionMinutos || 0} min de colaci&oacute;n libre</span>
                        ) : turno.tipoColacion === "fija" ? (
                          <span>Colaci&oacute;n fija {turno.colacionInicio || "--:--"} - {turno.colacionFin || "--:--"}</span>
                        ) : (
                          <span>Sin colaci&oacute;n</span>
                        )}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

const AsignacionStep = ({ asignaciones, setAsignaciones, trabajadores, planificaciones, grupos, errorGlobal }) => {
  const todayISO = new Date().toISOString().slice(0, 10)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTrabajadoresIds, setSelectedTrabajadoresIds] = useState([])
  const [bulkPlanificacionId, setBulkPlanificacionId] = useState("")
  const [bulkDesde, setBulkDesde] = useState("")
  const [bulkHasta, setBulkHasta] = useState("")
  const [bulkError, setBulkError] = useState("")

  const updateAsignacion = useCallback(
    (id, field, value) => {
      setAsignaciones((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)))
    },
    [setAsignaciones],
  )

  const addAsignacion = useCallback(() => {
    setAsignaciones((prev) => [
      ...prev,
      { id: Date.now(), trabajadorId: "", planificacionId: "", desde: "", hasta: "" },
    ])
  }, [setAsignaciones])

  const removeAsignacion = useCallback(
    (id) => {
      if (asignaciones.length === 1) return
      setAsignaciones((prev) => prev.filter((a) => a.id !== id))
    },
    [asignaciones, setAsignaciones],
  )

  const normalizedSearch = searchTerm.trim().toLowerCase()

  const matchesSearch = (t) => {
    if (!normalizedSearch) return true
    const nombre = (t.nombre || "").toLowerCase()
    const rut = (t.rut || "").toLowerCase()
    const correo = (t.correo || "").toLowerCase()
    const grupo = (t.grupoNombre || "").toLowerCase()
    return (
      nombre.includes(normalizedSearch) ||
      rut.includes(normalizedSearch) ||
      correo.includes(normalizedSearch) ||
      grupo.includes(normalizedSearch)
    )
  }

  const trabajadoresFiltradosBase = trabajadores.filter((t) => {
    const tieneAsignacionValida = asignaciones.some(
      (a) => a.trabajadorId === t.id && a.planificacionId && a.desde && a.hasta,
    )
    return !tieneAsignacionValida
  })

  const trabajadoresFiltrados = trabajadoresFiltradosBase.filter(matchesSearch)

  const toggleTrabajadorSeleccionado = useCallback(
    (id) => {
      setSelectedTrabajadoresIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    },
    [setSelectedTrabajadoresIds],
  )

  const seleccionarTodos = useCallback(() => {
    const ids = trabajadoresFiltrados.map((t) => t.id)
    setSelectedTrabajadoresIds(ids)
  }, [trabajadoresFiltrados, setSelectedTrabajadoresIds])

  const limpiarSeleccion = useCallback(() => {
    setSelectedTrabajadoresIds([])
  }, [setSelectedTrabajadoresIds])

  const crearAsignacionesMasivas = useCallback(() => {
    setBulkError("")

    if (!bulkPlanificacionId) {
      setBulkError("Selecciona una planificación para asignar.")
      return
    }
    if (!bulkDesde || !bulkHasta || (bulkHasta !== "permanente" && bulkHasta === "fecha")) {
      setBulkError("Debes indicar el periodo Desde y Hasta.")
      return
    }
    if (selectedTrabajadoresIds.length === 0) {
      setBulkError("Selecciona al menos un trabajador.")
      return
    }

    const nuevas = selectedTrabajadoresIds.map((trabId, idx) => ({
      id: Date.now() + idx,
      trabajadorId: trabId,
      planificacionId: bulkPlanificacionId,
      desde: bulkDesde,
      hasta: bulkHasta,
    }))

    setAsignaciones((prev) => [...prev, ...nuevas])
    setBulkError("")
    setSelectedTrabajadoresIds([])
  }, [
    selectedTrabajadoresIds,
    bulkPlanificacionId,
    bulkDesde,
    bulkHasta,
    setAsignaciones,
    setBulkError,
    setSelectedTrabajadoresIds,
  ])

  const getPlanificacionLabelForTrabajador = useCallback(
    (trabajadorId) => {
      const asignacionValida = asignaciones.find(
        (a) => a.trabajadorId === trabajadorId && a.planificacionId && a.desde && a.hasta,
      )
      if (!asignacionValida) return null
      const plan = planificaciones.find((p) => p.id === asignacionValida.planificacionId)
      return plan ? plan.nombre || "Sin nombre" : null
    },
    [asignaciones, planificaciones],
  )

  const totalTrabajadores = trabajadores.length
  const trabajadoresSinPlan = trabajadores.filter((t) => !getPlanificacionLabelForTrabajador(t.id)).length
  const trabajadoresPlanificados = trabajadores
    .map((t) => ({ ...t, planLabel: getPlanificacionLabelForTrabajador(t.id) }))
    .filter((t) => t.planLabel)

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Asignaci&oacute;n de planificaciones</h2>
        <details className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <summary className="text-sm font-medium text-emerald-900">
            C&oacute;mo asignar planificaciones
            <span className="ml-2 text-[11px] font-normal text-emerald-700">(ver pasos)</span>
          </summary>
          <div className="mt-2 space-y-2 text-xs text-emerald-800 leading-relaxed">
            <ol className="list-decimal space-y-1 pl-4">
              <li>Selecciona una planificaci&oacute;n creada en el paso anterior (Planificaciones).</li>
              <li>
                Define el per&iacute;odo: elige <strong>Desde</strong> y <strong>Hasta</strong>. Si no hay fecha de
                t&eacute;rmino, marca <strong>Permanente</strong>.
              </li>
              <li>
                Usa el buscador &quot;Buscar trabajador o grupo&quot; para filtrar por nombre, RUT, correo o grupo.
              </li>
              <li>
                Selecciona a los trabajadores (puedes usar &quot;Seleccionar todos&quot; o &quot;Limpiar selecci&oacute;n&quot;).
              </li>
              <li>
                Haz clic en &quot;Asignar planificaci&oacute;n a seleccionados&quot;. Al asignar, los trabajadores salen de
                &quot;Trabajadores sin planificar&quot; y aparecen en &quot;Trabajadores planificados&quot;.
              </li>
              <li>Repite el proceso hasta no dejar trabajadores en &quot;Trabajadores sin planificar&quot;.</li>
              <li>
                Si necesitas excepciones, usa &quot;Agregar asignaci&oacute;n manual&quot; para casos puntuales.
              </li>
            </ol>
          </div>
        </details>
      </header>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-700">
          Total de trabajadores: <span className="font-semibold text-slate-800">{totalTrabajadores}</span>
        </p>
        <p className="text-[11px] text-slate-700">
          Trabajadores sin planificar:{" "}
          <span className={trabajadoresSinPlan > 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>
            {trabajadoresSinPlan}
          </span>
        </p>
      </div>

      {errorGlobal && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-[11px] text-red-800">{errorGlobal}</div>
      )}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Trabajadores sin planificar</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-4 md:items-end">


          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-700 flex items-center gap-1">
              Buscar trabajador o grupo
              <span
                className="cursor-help rounded-full border border-slate-300 px-1 text-[9px] text-slate-600"
                title="Busca por nombre, RUT, correo o grupo (ej: Mar&iacute;a, 18435922-7, correo@empresa.cl, Operaciones)."
              >
                ?
              </span>
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, RUT, correo o grupo"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-700">Planificación a asignar</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={bulkPlanificacionId}
              onChange={(e) => setBulkPlanificacionId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Seleccionar…</option>
              {planificaciones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre || "Sin nombre"}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-700 flex items-center gap-1">
              Desde
              <span
                className="cursor-help rounded-full border border-slate-300 px-1 text-[9px] text-slate-600"
                title={TOOLTIP_PERIODO_PLAN}
              >
                ?
              </span>
            </label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={bulkDesde}
              min={todayISO}
              onChange={(e) => {
                const next = e.target.value
                setBulkDesde(next)
                if (bulkHasta && bulkHasta !== "permanente" && next && bulkHasta < next) {
                  setBulkHasta(next)
                }
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-700 flex items-center gap-1">
              Hasta
              <span
                className="cursor-help rounded-full border border-slate-300 px-1 text-[9px] text-slate-600"
                title={TOOLTIP_PERIODO_PLAN}
              >
                ?
              </span>
            </label>
            <div className="space-y-1">
              {bulkHasta === "permanente" ? (
                <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-200 px-2 py-1.5 text-[11px]">
                  <span className="text-slate-600">Permanente</span>
                  <button
                    type="button"
                    onClick={() => setBulkHasta("")}
                    className="text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    Elegir fecha
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    value={bulkHasta}
                    min={bulkDesde || todayISO}
                    onChange={(e) => setBulkHasta(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setBulkHasta("permanente")}
                    className="text-[11px] text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    Permanente
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-slate-200 pt-2">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-slate-700">Trabajadores filtrados</p>
            <p className="text-[11px] text-slate-500">
              Selecciona los trabajadores a los que aplicarás la planificación.
            </p>
          </div>
          <div className="flex gap-2 text-[11px]">
            <button
              type="button"
              onClick={seleccionarTodos}
              className="rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Seleccionar todos
            </button>
            <button
              type="button"
              onClick={limpiarSeleccion}
              className="rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Limpiar selección
            </button>
          </div>
        </div>

        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-1 text-left font-medium text-slate-700">Sel.</th>
                <th className="px-3 py-1 text-left font-medium text-slate-700">Nombre</th>
                <th className="px-3 py-1 text-left font-medium text-slate-700">Grupo</th>
              </tr>
            </thead>
            <tbody>
              {trabajadoresFiltrados.map((t) => {
                const isSelected = selectedTrabajadoresIds.includes(t.id)
                const grupo =
                  grupos.find((g) => g.id === Number(t.grupoId)) ||
                  (t.grupoNombre
                    ? grupos.find((g) => normalizeGroupName(g.nombre || "") === normalizeGroupName(t.grupoNombre || ""))
                    : undefined)
                return (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-3 py-1 text-center">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleTrabajadorSeleccionado(t.id)} />
                    </td>
                    <td className="px-3 py-1">
                      {t.nombre || "Sin nombre"}
                      {t.rut ? <span className="text-[10px] text-slate-500"> – {t.rut}</span> : null}
                    </td>
                    <td className="px-3 py-1">{grupo ? grupo.nombre : "Sin grupo"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {bulkError && <p className="text-[11px] text-red-600">{bulkError}</p>}

        <button
          type="button"
          onClick={crearAsignacionesMasivas}
          className="inline-flex items-center rounded-full bg-sky-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-sky-600"
        >
          Asignar planificación a seleccionados
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-700">Trabajador</th>
              <th className="px-3 py-2 text-left font-medium text-slate-700">Planificación</th>
              <th className="px-3 py-2 text-left font-medium text-slate-700">
                <span className="flex items-center gap-1">
                  Desde
                  <span
                    className="cursor-help rounded-full border border-slate-300 px-1 text-[9px] text-slate-600"
                    title={TOOLTIP_PERIODO_PLAN}
                  >
                    ?
                  </span>
                </span>
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-700">
                <span className="flex items-center gap-1">
                  Hasta
                  <span
                    className="cursor-help rounded-full border border-slate-300 px-1 text-[9px] text-slate-600"
                    title={TOOLTIP_PERIODO_PLAN}
                  >
                    ?
                  </span>
                </span>
              </th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {asignaciones.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-3 py-1.5">
                  <select
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    value={a.trabajadorId}
                    onChange={(e) =>
                      updateAsignacion(a.id, "trabajadorId", e.target.value ? Number(e.target.value) : "")
                    }
                  >
                    <option value="">Seleccionar…</option>
                    {trabajadores.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre || "Sin nombre"}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <select
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    value={a.planificacionId}
                    onChange={(e) =>
                      updateAsignacion(a.id, "planificacionId", e.target.value ? Number(e.target.value) : "")
                    }
                  >
                    <option value="">Seleccionar…</option>
                    {planificaciones.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre || "Sin nombre"}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    type="date"
                    value={a.desde}
                    min={todayISO}
                    onChange={(e) => {
                      const next = e.target.value
                      updateAsignacion(a.id, "desde", next)
                      if (a.hasta && a.hasta !== "permanente" && next && a.hasta < next) {
                        updateAsignacion(a.id, "hasta", next)
                      }
                    }}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <div className="space-y-1">
                    {a.hasta === "permanente" ? (
                      <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-200 px-2 py-1.5 text-[11px]">
                        <span className="text-slate-600">Permanente</span>
                        <button
                          type="button"
                          onClick={() => updateAsignacion(a.id, "hasta", "")}
                          className="text-sky-600 hover:text-sky-700 hover:underline"
                        >
                          Elegir fecha
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          type="date"
                          value={a.hasta}
                          min={a.desde || todayISO}
                          onChange={(e) => updateAsignacion(a.id, "hasta", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => updateAsignacion(a.id, "hasta", "permanente")}
                          className="text-[11px] text-sky-600 hover:text-sky-700 hover:underline"
                        >
                          Permanente
                        </button>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => removeAsignacion(a.id)}
                    className="rounded-full px-2 py-1 text-[11px] text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addAsignacion}
        className="mt-2 inline-flex items-center rounded-full border border-sky-500 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
      >
        + Agregar asignación manual
      </button>

      <div className="mt-6 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Trabajadores planificados</h3>
        </div>
        <p className="text-[11px] text-slate-600">
          Aqu&iacute; ver&aacute;s a los trabajadores que ya tienen una planificaci&oacute;n asignada.
        </p>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-700">Trabajador</th>
                <th className="px-3 py-2 text-left font-medium text-slate-700">Planificaci&oacute;n asignada</th>
              </tr>
            </thead>
            <tbody>
              {trabajadoresPlanificados.map((t) => {
                const label = t.planLabel
                return (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">
                      {t.nombre || "Sin nombre"}
                      {t.rut ? <span className="text-[10px] text-slate-500"> – {t.rut}</span> : null}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        {label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

const DecisionStep = ({ onDecision }) => {
  return (
    <section className="space-y-6">
      <header className="text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
          ¿Deseas configurar turnos y planificaciones ahora?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Puedes configurar los turnos, planificaciones y asignaciones ahora, o verlo más tarde durante la capacitación
          de la plataforma.
        </p>
      </header>

      <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onDecision("now")}
          className="group relative overflow-hidden rounded-2xl border-2 border-sky-300 bg-white p-6 text-left transition-all hover:border-sky-500 hover:shadow-lg"
        >
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600 transition-colors group-hover:bg-sky-500 group-hover:text-white">
            <Users className="h-6 w-6" aria-hidden="true" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900">Configurar ahora</h3>
          <p className="text-sm text-slate-600">
            Continúa configurando turnos, planificaciones y asignaciones en los siguientes pasos.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onDecision("later")}
          className="group relative overflow-hidden rounded-2xl border-2 border-emerald-300 bg-white p-6 text-left transition-all hover:border-emerald-500 hover:shadow-lg"
        >
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 transition-colors group-hover:bg-emerald-500 group-hover:text-white">
            <Clock className="h-6 w-6" aria-hidden="true" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900">Ver en capacitación</h3>
          <p className="text-sm text-slate-600">
            Omite esta configuración y completa el onboarding. Lo verás durante la capacitación de la plataforma.
          </p>
        </button>
      </div>
    </section>
  )
}

const WorkersDecisionStep = ({ onDecision }: { onDecision: (decision: "now" | "later") => void }) => {
  return (
    <section className="space-y-6">
      <header className="text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900">¿Deseas cargar trabajadores ahora?</h2>
        <p className="mt-2 text-sm text-slate-600">
          Puedes cargar los trabajadores ahora o hacerlo más tarde durante la capacitación de la plataforma.
        </p>
      </header>

      <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onDecision("now")}
          className="group relative overflow-hidden rounded-2xl border-2 border-sky-300 bg-white p-6 text-left transition-all hover:border-sky-500 hover:shadow-lg"
        >
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600 transition-colors group-hover:bg-sky-500 group-hover:text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              className="h-6 w-6"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900">Cargar ahora</h3>
          <p className="text-sm text-slate-600">Continúa cargando los trabajadores en el siguiente paso.</p>
        </button>

        <button
          type="button"
          onClick={() => onDecision("later")}
          className="group relative overflow-hidden rounded-2xl border-2 border-emerald-300 bg-white p-6 text-left transition-all hover:border-emerald-500 hover:shadow-lg"
        >
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 transition-colors group-hover:bg-emerald-500 group-hover:text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              className="h-6 w-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900">Cargar en capacitación</h3>
          <p className="text-sm text-slate-600">
            Salta a la revisión final. Cargarás trabajadores durante la capacitación de la plataforma.
          </p>
        </button>
      </div>
    </section>
  )
}

const casosDeExitoVideos = [
  {
    empresa: "Starbucks",
    industria: "Alimentación",
    videoId: "Je6-Ka-1Fjo",
    quote: "Logramos reducir en un 90% el tiempo dedicado a gestión de asistencia",
  },
  {
    empresa: "Huawei Chile",
    industria: "Telecomunicaciones",
    videoId: "wg8iLbheAzg",
    quote: "Control total de nuestros equipos en tiempo real desde cualquier lugar",
  },
  {
    empresa: "Bureau Veritas",
    industria: "Certificación",
    videoId: "Ofzj8SsgdDs",
    quote: "Procesos de nómina más eficientes y sin errores",
  },
  {
    empresa: "Virgin Mobile",
    industria: "Telecomunicaciones",
    videoId: "BHXid-4Rlrg",
    quote: "Visibilidad completa del equipo de ventas en terreno",
  },
  {
    empresa: "Toshiba",
    industria: "Tecnología",
    videoId: "P-SDGVuoquM",
    quote: "Automatización que nos ahorra horas de trabajo administrativo",
  },
  {
    empresa: "Energy Fitness",
    industria: "Fitness",
    videoId: "9Ix6xiSH9SY",
    quote: "Gestión simplificada de turnos rotativos",
  },
]

const beneficiosGeoVictoria = [
  {
    icon: TrendingUp,
    titulo: "Reduce errores de nómina",
    descripcion: "Hasta 90% menos errores en cálculos de asistencia",
  },
  {
    icon: Clock,
    titulo: "Ahorra tiempo",
    descripcion: "Automatiza procesos que antes tomaban horas",
  },
  {
    icon: Users,
    titulo: "Control en tiempo real",
    descripcion: "Visibilidad de tu equipo desde cualquier lugar",
  },
  {
    icon: Shield,
    titulo: "Datos seguros",
    descripcion: "Información protegida y respaldada en la nube",
  },
]

const BienvenidaMarketingStep = ({
  nombreEmpresa,
  onContinue,
}: {
  nombreEmpresa?: string
  onContinue: () => void
}) => {
  const [currentSlide, setCurrentSlide] = useState(0)

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % casosDeExitoVideos.length)
  }, [setCurrentSlide])

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + casosDeExitoVideos.length) % casosDeExitoVideos.length)
  }, [setCurrentSlide])

  return (
    <section className="space-y-8 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-6 md:p-8">
      <div className="text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/30 mb-2">
          <Rocket className="w-10 h-10 text-white" />
        </div>

        {nombreEmpresa ? (
          <>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
              ¡Bienvenido, <span className="text-sky-600">{nombreEmpresa}</span>!
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Estás a punto de unirte a miles de empresas que ya transformaron su gestión de asistencia con GeoVictoria.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
              ¡Bienvenido a <span className="text-sky-600">GeoVictoria</span>!
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Estás a punto de transformar la gestión de asistencia de tu empresa. Miles de organizaciones ya lo
              hicieron.
            </p>
          </>
        )}

        <div className="flex flex-col items-center gap-3 mt-6">
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
            Estamos emocionados de acompañarte en este proceso
          </p>
          <Button
            onClick={onContinue}
            size="lg"
            className="bg-sky-600 hover:bg-sky-700 text-white shadow-lg shadow-sky-600/30 hover:shadow-xl hover:shadow-sky-600/40 transition-all duration-300 text-base px-8 py-6 rounded-full"
          >
            <Zap className="w-5 h-5 mr-2" />
            Comenzar mi implementación
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>

      {/* Beneficios destacados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {beneficiosGeoVictoria.map((beneficio, index) => (
          <div
            key={index}
            className="bg-white rounded-xl border border-slate-200 p-4 text-center"
          >
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sky-100 mb-3">
              <beneficio.icon className="w-6 h-6 text-sky-600" />
            </div>
            <h3 className="font-semibold text-slate-800 text-sm mb-1">{beneficio.titulo}</h3>
            <p className="text-xs text-slate-500">{beneficio.descripcion}</p>
          </div>
        ))}
      </div>

      {/* Estadísticas de confianza */}
      <div className="bg-gradient-to-r from-sky-600 to-sky-700 rounded-xl p-6 text-white">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold">+5,000</p>
            <p className="text-sky-200 text-sm">Empresas activas</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold">+1M</p>
            <p className="text-sky-200 text-sm">Trabajadores gestionados</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold">15+</p>
            <p className="text-sky-200 text-sm">Países en Latam</p>
          </div>
        </div>
      </div>

      {/* Casos de éxito con videos */}
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Award className="w-5 h-5 text-amber-500" />
          <h2 className="font-semibold text-slate-800">Empresas que confían en nosotros</h2>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="relative">
            {/* Carrusel de videos */}
            <div className="overflow-hidden rounded-xl">
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
              >
                {casosDeExitoVideos.map((caso, index) => (
                  <div key={index} className="w-full flex-shrink-0 px-2">
                    <div className="space-y-3">
                      {/* Info de la empresa */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-sky-500" />
                          <span className="font-semibold text-slate-800">{caso.empresa}</span>
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            {caso.industria}
                          </span>
                        </div>
                      </div>

                      {/* Quote */}
                      <p className="text-sm text-slate-600 italic border-l-2 border-sky-300 pl-3">"{caso.quote}"</p>

                      {/* Video de YouTube */}
                      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-900">
                        <iframe
                          src={`https://www.youtube.com/embed/${caso.videoId}?rel=0`}
                          title={`Caso de éxito: ${caso.empresa}`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="absolute inset-0 w-full h-full"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Botones de navegación */}
            <button
              onClick={prevSlide}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 bg-white rounded-full p-2 shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors z-10 hidden sm:inline-flex"
              aria-label="Video anterior"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 bg-white rounded-full p-2 shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors z-10 hidden sm:inline-flex"
              aria-label="Video siguiente"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          {/* Indicadores */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <div className="flex justify-center gap-1.5">
              {casosDeExitoVideos.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentSlide ? "bg-sky-500" : "bg-slate-300 hover:bg-slate-400"
                  }`}
                  aria-label={`Ir a video ${index + 1}`}
                />
              ))}
            </div>
            <span className="text-xs text-slate-500">
              {currentSlide + 1} de {casosDeExitoVideos.length} casos de éxito
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

const AntesDeComenzarStep = ({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) => {
  return (
    <section className="space-y-6 max-w-[1700px] mx-auto">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-2">
          <CheckCircle2 className="w-8 h-8 text-slate-600" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Antes de comenzar</h1>
        <p className="text-slate-600 max-w-2xl mx-auto">
          En 2 minutos sabrás qué es obligatorio y qué puedes dejar para después.
        </p>
      </div>

      {/* Lo obligatorio y opcional */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-medium text-slate-900 mb-4">Lo que te pediremos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">Obligatorio para continuar</p>
            <ul className="space-y-2 text-xs text-slate-600">
              <li>
                <span className="font-medium text-slate-700">Empresa:</span> Razón social, RUT, dirección, comuna,
                giro, rubro, teléfono de contacto, email de facturación y sistema de marcaje.
              </li>
              <li>
                <span className="font-medium text-slate-700">Administrador principal:</span> nombre, apellido, RUT,
                correo y teléfono.
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">Opcional por ahora</p>
            <ul className="space-y-2 text-xs text-slate-600">
              <li>
                <span className="font-medium text-slate-700">Trabajadores:</span> nombre, RUT, correo y grupo (puedes
                cargarlos ahora o durante la capacitación). Si eliges Marcaje por Llamada, necesitarás el Teléfono 1 para
                que puedan marcar.
              </li>
              <li>
                <span className="font-medium text-slate-700">Turnos y planificaciones:</span> solo si decides
                configurarlos ahora.
              </li>
              <li>
                <span className="font-medium text-slate-700">Modulos adicionales:</span> puedes seleccionarlos en el
                paso Empresa para potenciar tu implementacion. El precio se consulta por WhatsApp con tu ejecutivo.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mensaje tranquilizador */}
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-emerald-800">No te preocupes si no tienes todo perfecto</h3>
              <p className="text-sm text-emerald-700 mt-1">
                Puedes avanzar con la información que tengas. Al final podrás revisar todo, y siempre podrás hacer
                ajustes más adelante. Tus datos están protegidos y seguros.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
          <h2 className="font-semibold text-amber-800 flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            Checklist según tu elección
          </h2>
          <ul className="space-y-2 text-sm text-amber-700">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Si vas a cargar trabajadores ahora: lista básica con nombre, RUT y correo.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Si usarás Marcaje por Llamada: Teléfono 1 de cada trabajador.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Si vas a configurar turnos ahora: horarios y períodos de descanso.
            </li>
          </ul>
        </div>
      </div>

      {/* Tiempo estimado */}
      <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
        <Clock className="w-4 h-4" />
        <span>Tiempo estimado: 10-15 minutos</span>
      </div>

      {/* Botón continuar */}
      <div className="flex flex-col sm:flex-row justify-center items-stretch sm:items-center gap-3 sm:gap-4 py-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-100 w-full sm:w-auto"
        >
          <ArrowLeft className="w-5 h-5" />
          Atrás
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3 text-base font-semibold text-white hover:bg-sky-600 transition-colors shadow-lg shadow-sky-500/25 w-full sm:w-auto"
        >
          Entendido, continuar
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  )
}

// Define the Empresa type (assuming it's defined elsewhere or needs to be defined here)
type Empresa = {
  razonSocial: string
  nombreFantasia: string
  rut: string
  giro: string
  direccion: string
  comuna: string
  emailFacturacion: string
  telefonoContacto: string
  ejecutivoTelefono?: string
  ejecutivoNombre?: string
  sistema: string[]
  modulosAdicionales: string[]
  modulosAdicionalesOtro: string
  rubro: string
  grupos: { id: number; nombre: string; descripcion: string }[]
  id_zoho: string | null
}

// Define OnboardingFormData type
type OnboardingFormData = {
  empresa: Empresa
  admins: {
    id: number
    nombre: string
    apellido: string
    rut: string
    email: string
    telefono: string
  }[]
  trabajadores: {
    id: number
    nombre: string
    rut: string
    correo: string
    grupoId: string
    telefono1: string
    telefono2: string
    telefono3: string
    tipo: "usuario" | "administrador"
  }[]
  turnos: {
    id: number
    nombre: string
    horaInicio: string
    horaFin: string
    tipoColacion: "sin" | "libre" | "fija" // Added type for colacion
    colacionMinutos: number
    colacionInicio: string
    colacionFin: string
    tooltip: string
  }[]
  planificaciones: {
    id: number
    nombre: string
    diasTurnos: (number | null)[]
  }[]
  asignaciones: {
    id: number
    trabajadorId: string | number
    planificacionId: string | number
    desde: string
    hasta: string
  }[]
  configureNow: boolean | undefined // Added undefined to allow initial state
  loadWorkersNow?: boolean // Added loadWorkersNow to OnboardingFormData
  telefonoCallDeferred?: boolean // Declaración de carga posterior de teléfono
}

// Define Grupo and Trabajador types for clarity (assuming they might be used elsewhere)
type Grupo = {
  id: number
  nombre: string
  descripcion: string
}
type Trabajador = {
  id: number
  nombre: string
  rut: string
  correo: string
  grupoId: string
  grupoNombre?: string
  telefono1: string
  telefono2: string
  telefono3: string
  tipo: "usuario" | "administrador"
}

// Define EditedFields type
type EditedFields = Record<string, { originalValue: any; currentValue: any }>

function getEmptyEmpresa(): Empresa {
  return {
    razonSocial: "",
    nombreFantasia: "",
    rut: "",
    giro: "",
    direccion: "",
    comuna: "",
    emailFacturacion: "",
    telefonoContacto: "",
    ejecutivoTelefono: "",
    ejecutivoNombre: "",
    sistema: [],
    modulosAdicionales: [],
    modulosAdicionalesOtro: "",
    rubro: "",
    grupos: [],
    id_zoho: null,
  }
}

const normalizeWhatsappNumber = (value?: string) => (value || "").replace(/\D/g, "")

const WhatsAppIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <path
      fill="currentColor"
      d="M16 3C9.4 3 4 8.4 4 15c0 2.3.7 4.6 2 6.6L4 29l7.7-2c1.9 1 4 1.5 6.3 1.5 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 22.1c-2 0-3.9-.6-5.6-1.7l-.4-.2-4.6 1.2 1.2-4.5-.3-.5C5.4 18 5 16.5 5 15c0-6.1 4.9-11 11-11s11 4.9 11 11-4.9 11.1-11 11.1zm6-8.3c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2-.8 1-.9 1.2-.4.3-.7.1c-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.8-1-2.4c-.3-.7-.6-.6-.7-.6h-.6c-.2 0-.5.1-.7.3s-1 1-1 2.5 1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5 4.5.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.3.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.4z"
    />
  </svg>
)

const WhatsAppFloatingButton = ({
  phone,
  companyName,
  onboardingId,
  executiveName,
}: {
  phone?: string
  companyName?: string
  onboardingId?: string | null
  executiveName?: string
}) => {
  const normalized = normalizeWhatsappNumber(phone)
  const [isDismissed, setIsDismissed] = useState(false)


  if (!normalized) return null
  const sender = companyName || "mi empresa"
  const contactName = executiveName || "tu ejecutivo comercial"
  const text = `Hola ${contactName}, soy de la empresa ${sender} y tengo dudas sobre mi onboarding, podrias ayudarme por favor?`
  const link = `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`
  const label = executiveName
    ? `Tienes dudas sobre tu onboarding? Soy ${executiveName}, tu ejecutivo comercial. Hablemos por WhatsApp.`
    : "Tienes dudas sobre tu onboarding? Soy tu ejecutivo comercial. Hablemos por WhatsApp."

  const handleDismiss = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDismissed(true)
  }

  const handleRestore = () => {
    setIsDismissed(false)
  }

  if (isDismissed) {
    return (
      <button
        type="button"
        onClick={handleRestore}
        className="fixed bottom-24 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700"
        aria-label="Mostrar WhatsApp"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
          <svg viewBox="0 0 32 32" className="h-3.5 w-3.5 fill-white" aria-hidden="true">
            <path d="M16 3C9.4 3 4 8.4 4 15c0 2.3.7 4.6 2 6.6L4 29l7.7-2c1.9 1 4 1.5 6.3 1.5 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 22.1c-2 0-3.9-.6-5.6-1.7l-.4-.2-4.6 1.2 1.2-4.5-.3-.5C5.4 18 5 16.5 5 15c0-6.1 4.9-11 11-11s11 4.9 11 11-4.9 11.1-11 11.1zm6-8.3c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2-.8 1-.9 1.2-.4.3-.7.1c-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.8-1-2.4c-.3-.7-.6-.6-.7-.6h-.6c-.2 0-.5.1-.7.3s-1 1-1 2.5 1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5 4.5.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.3.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.4z" />
          </svg>
        </span>
        Hablemos!
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-xs">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="relative inline-flex w-full items-center gap-3 rounded-2xl bg-emerald-500 px-4 py-3 text-left text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600"
        aria-label="Contactar por WhatsApp"
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Cerrar aviso de WhatsApp"
          className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-emerald-600 shadow"
        >
          x
        </button>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
          <svg viewBox="0 0 32 32" className="h-4 w-4 fill-white" aria-hidden="true">
            <path d="M16 3C9.4 3 4 8.4 4 15c0 2.3.7 4.6 2 6.6L4 29l7.7-2c1.9 1 4 1.5 6.3 1.5 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 22.1c-2 0-3.9-.6-5.6-1.7l-.4-.2-4.6 1.2 1.2-4.5-.3-.5C5.4 18 5 16.5 5 15c0-6.1 4.9-11 11-11s11 4.9 11 11-4.9 11.1-11 11.1zm6-8.3c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2-.8 1-.9 1.2-.4.3-.7.1c-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.8-1-2.4c-.3-.7-.6-.6-.7-.6h-.6c-.2 0-.5.1-.7.3s-1 1-1 2.5 1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5 4.5.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.3.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.4z" />
          </svg>
        </span>
        <span className="leading-snug">{label}</span>
      </a>
    </div>
  )
}
// CHANGE: Adding NavigationButtons component and its usage
const NavigationButtons = () => {
  const router = useRouter()
  const pathname = router.pathname
  const currentStep = Number.parseInt(pathname.split("/").pop() || "0", 10)

  const handleNext = () => {
    // Implement navigation logic here, possibly calling a goNext function from the parent component
    console.log("Next clicked")
  }

  const handleBack = () => {
    // Implement navigation logic here, possibly calling a goBack function from the parent component
    console.log("Back clicked")
  }

  // This is a placeholder. The actual navigation logic needs to be passed down or managed globally.
  // For demonstration, we'll assume it's called from the main component.
  return (
    <div className="mt-8 flex items-center justify-center gap-4">
      {/* The actual buttons will be rendered by the parent component based on context */}
    </div>
  )
}

// Helper function to find the index of a step by its label
const getStepIndexByLabel = (label: string): number => {
  return steps.findIndex((step) => step.label === label)
}

// Helper function to get the current step based on the navigation history
// This is a simplified approach; in a real app, you might want to pass currentStep down
const getCurrentStepFromHistory = (history: number[], defaultStep: number): number => {
  return history.length > 0 ? history[history.length - 1] : defaultStep
}

// Helper function to update the state for `trabajadores` and `grupos`
const updateTrabajadoresAndGrupos = (
  currentTrabajadores: Trabajador[],
  setTrabajadores: React.Dispatch<React.SetStateAction<Trabajador[]>>,
  currentGrupos: Grupo[],
  setGrupos: React.Dispatch<React.SetStateAction<Grupo[]>>,
  ensureGrupoByName: (grupoNombre: string) => string,
) => {
  // This function will be used to ensure that all workers have valid group IDs
  // and that all groups mentioned by workers exist.
  let updatedTrabajadores = [...currentTrabajadores]
  const updatedGrupos = [...currentGrupos]
  let groupChanged = false

  updatedTrabajadores = updatedTrabajadores.map((trabajador) => {
    if (trabajador.grupoId) {
      // Check if the group exists
      const grupoExists = updatedGrupos.some((g) => g.id === Number.parseInt(trabajador.grupoId))
      if (!grupoExists && trabajador.grupoNombre) {
        // If not, create it
        const newGroupId = ensureGrupoByName(trabajador.grupoNombre)
        groupChanged = true
        return { ...trabajador, grupoId: newGroupId }
      }
    } else if (trabajador.grupoNombre) {
      // If grupoId is empty but grupoNombre exists, create the group
      const newGroupId = ensureGrupoByName(trabajador.grupoNombre)
      groupChanged = true
      return { ...trabajador, grupoId: newGroupId }
    }
    return trabajador
  })

  if (groupChanged) {
    setTrabajadores(updatedTrabajadores)
    setGrupos(updatedGrupos) // Assuming ensureGrupoByName also updates the groups list if needed
  }
}

function OnboardingTurnosCliente() {
  const router = useRouter()
  const { toast } = useToast() // Import toast here

  const [currentStep, setCurrentStep] = useState(PRIMER_PASO)
  const [formData, setFormData] = useState<OnboardingFormData>({
    empresa: getEmptyEmpresa(),
    admins: [],
    trabajadores: [],
    turnos: DEFAULT_TURNOS,
    planificaciones: [],
    asignaciones: [],
    configureNow: undefined,
    loadWorkersNow: undefined,
    telefonoCallDeferred: false,
  })
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [navigationHistory, setNavigationHistory] = useState([PRIMER_PASO])
  const [onboardingId, setOnboardingId] = useState<string | null>(null)
  const [idZoho, setIdZoho] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [trabajadoresStepKey, setTrabajadoresStepKey] = useState(0)

  const [showTelefonoCallModal, setShowTelefonoCallModal] = useState(false)
  const [telefonoCallMissingCount, setTelefonoCallMissingCount] = useState(0)
  const [telefonoCallConfirmChecked, setTelefonoCallConfirmChecked] = useState(false)
  const skipCallPhoneCheckRef = useRef(false)
  const telefonoCallDeferredRef = useRef(false)
  const [showModulosUpsellModal, setShowModulosUpsellModal] = useState(false)
  const skipModulosUpsellRef = useRef(false)

  const [isInitialized, setIsInitialized] = useState(false)

  const [showDesktopNotice, setShowDesktopNotice] = useState(false)

  const [showResumeMessage, setShowResumeMessage] = useState(false)
  const [resumeStepName, setResumeStepName] = useState("")
  const [showResumeModal, setShowResumeModal] = useState(false)

  const [showConfirmRestart, setShowConfirmRestart] = useState(false)
  const [noAdminsError, setNoAdminsError] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [prefilledFields, setPrefilledFields] = useState<Set<string>>(new Set())
  const [editedFields, setEditedFields] = useState<EditedFields>({})

  useEffect(() => {
    telefonoCallDeferredRef.current = Boolean(formData.telefonoCallDeferred)
  }, [formData.telefonoCallDeferred])

  useEffect(() => {
    if (typeof window === "undefined") return
    const dismissed = window.localStorage.getItem("gv_desktop_notice_dismissed") === "1"
    if (dismissed) return

    const check = () => {
      const isSmall =
        window.matchMedia("(max-width: 768px)").matches || window.matchMedia("(pointer: coarse)").matches
      setShowDesktopNotice(isSmall)
    }

    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  const dismissDesktopNotice = () => {
    setShowDesktopNotice(false)
    if (typeof window !== "undefined") {
      window.localStorage.setItem("gv_desktop_notice_dismissed", "1")
    }
  }

  // --- Helper functions for state management and UI ---

  const setEmpresa = useCallback(
    (updater: Empresa | ((prev: Empresa) => Empresa)) => {
      setFormData((prev) => ({
        ...prev,
        empresa: typeof updater === "function" ? updater(prev.empresa) : updater,
      }))
    },
    [setFormData],
  )

  const isFieldPrefilled = useCallback(
    (fieldKey: string): boolean => {
      return prefilledFields.has(fieldKey)
    },
    [prefilledFields],
  )

  const isFieldEdited = useCallback(
    (fieldKey: string): boolean => {
      return editedFields.hasOwnProperty(fieldKey)
    },
    [editedFields],
  )

  const trackFieldChange = useCallback(
    (fieldKey: string, newValue: any) => {
      setEditedFields((prev) => {
        // If it was prefilled, track the change
        if (isFieldPrefilled(fieldKey)) {
          return {
            ...prev,
            [fieldKey]: {
              originalValue: prev[fieldKey]?.originalValue ?? formData.empresa[fieldKey.split(".")[1]] ?? "", // Fallback
              currentValue: newValue,
            },
          }
        }
        return prev
      })
    },
    [formData, isFieldPrefilled],
  )

  const grupoIdCounterRef = useRef(Date.now())

  const ensureGrupoByName = useCallback(
    (grupoNombre: string): string => {
      const trimmedNombre = grupoNombre.trim()
      if (!trimmedNombre) return ""

      const normalizedNombre = normalizeGroupName(trimmedNombre)
      const existingGrupo = grupos.find((g) => normalizeGroupName(g.nombre) === normalizedNombre)

      if (existingGrupo) {
        console.log(`[v0] Grupo existente reutilizado: "${trimmedNombre}" -> ID: ${existingGrupo.id}`)
        return String(existingGrupo.id)
      } else {
        const newId = grupoIdCounterRef.current++
        const newGrupo = {
          id: newId,
          nombre: trimmedNombre,
          descripcion: "",
        }
        setGrupos((prev) => [...prev, newGrupo])
        setFormData((prev) => ({
          ...prev,
          empresa: { ...prev.empresa, grupos: [...prev.empresa.grupos, newGrupo] },
        }))
        console.log(`[v0] Nuevo grupo creado: "${trimmedNombre}" -> ID: ${newGrupo.id}`)
        return String(newGrupo.id)
      }
    },
    [grupos, setGrupos, setFormData],
  )

  const removeAdmin = useCallback(
    (indexToRemove: number) => {
      setFormData((prev) => {
        const updatedAdmins = prev.admins.filter((_, index) => index !== indexToRemove)
        return { ...prev, admins: updatedAdmins }
      })
    },
    [setFormData],
  )

  const hasInitialized = useRef(false)

  useEffect(() => {
    if (hasInitialized.current) {
      console.log("[v0] useEffect: Already initialized, skipping")
      return
    }

    console.log("[v0] useEffect: Initializing for the first time")
    hasInitialized.current = true
    initializeOnboarding()
  }, []) // Array de dependencias vacío para ejecutar solo una vez al montar

  // CHANGE: Updated initialization logic to use token from URL
  const initializeOnboarding = async () => {
    setIsInitialized(false)
    let loadedFormData: OnboardingFormData | null = null

    console.log("[v0] Initial load: INICIO")

    // Read token from URL
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get("token")

    console.log("[v0] Initial load: Token found:", token)

    if (token) {
      try {
        // Fetch onboarding data using token
        const response = await fetch(`/api/onboarding/${token}`)

        if (response.ok) {
          const result = await response.json()
          console.log("[v0] Respuesta de BD:", result)

          if (result.success) {
            // Set onboarding ID
            setOnboardingId(token)
            console.log("[v0] onboardingId establecido:", token)

            // Set id_zoho from the database
            if (result.id_zoho) {
              setIdZoho(result.id_zoho)
            }

            // Load form data
            if (result.formData) {
              console.log("[v0] Cargando formData:", result.formData)
              // Ensure default turns are present if not in loaded data
              loadedFormData = {
                ...result.formData,
                empresa: normalizeEmpresaModulos(result.formData.empresa || getEmptyEmpresa()),
                turnos: result.formData.turnos?.length ? result.formData.turnos : DEFAULT_TURNOS,
              }
              setFormData(loadedFormData)
            }

            // Load last step
            const lastStep = Math.max(result.lastStep ?? 0, result.currentStep ?? 0)
            console.log("[v0] lastStep:", lastStep)

            // Load navigation history
            if (result.navigationHistory) {
              console.log("[v0] Cargando navigationHistory:", result.navigationHistory)
              setNavigationHistory(result.navigationHistory)
            }

            // Show resume message if returning to advanced step (>= 3) and not completed
            console.log("[v0] lastStep >= 3?", lastStep >= 3)
            console.log("[v0] lastStep < 11?", lastStep < 11)

            if (lastStep >= 3 && lastStep < 11) {
              console.log("[v0] Preparando mensaje de sesión retomada")
              const stepName = steps[lastStep]?.label || `Paso ${lastStep}` // Use label from steps array
              console.log("[v0] Step name:", stepName)

              setTimeout(() => {
                console.log("[v0] Mostrando mensaje de sesión retomada")
                setResumeStepName(stepName)
                setShowResumeModal(true)
              }, 500)
            }

            // Set current step
            setCurrentStep(lastStep)
            console.log(
              "[v0] Initial load: Loaded step",
              lastStep,
              "with history",
              result.navigationHistory || [lastStep],
            )
          }
        } else {
          console.error("[v0] Error al cargar datos:", response.statusText)
          toast({
            title: "Error",
            description: "No se pudo cargar el progreso del onboarding.",
            variant: "destructive",
          })
        }
      } catch (error) {
        console.error("[v0] Error en fetch:", error)
        toast({
          title: "Error de conexión",
          description: "No se pudo conectar con el servidor para cargar el onboarding.",
          variant: "destructive",
        })
      }
    } else {
      console.log("[v0] No token found - user must use link from /api/generate-link")
      // If no token, it implies this is a new onboarding. We will create a new record later if needed.
      // For now, we proceed with default empty state.
    }

    // Initialize groups and workers
    const hydratedFormData = loadedFormData || formData
    if (token && hydratedFormData?.empresa?.grupos) {
      // If data was loaded with a token, use its groups
      console.log("[v0] Inicializacion: Cargando grupos desde BD:", hydratedFormData.empresa.grupos.length)
      setGrupos(hydratedFormData.empresa.grupos)
    } else {
      // New onboarding: start with no groups until the user adds them
      setGrupos([])
      if (!token) {
        setFormData((prev) => ({
          ...prev,
          empresa: { ...prev.empresa, grupos: [] },
        }))
      }
    }

    if (token && hydratedFormData?.trabajadores) {
      console.log("[v0] Inicializacion: Cargando trabajadores desde BD:", hydratedFormData.trabajadores.length)
      setTrabajadores(hydratedFormData.trabajadores)
    }

    // If data was loaded, ensure workers and groups are in sync
    if (token && hydratedFormData?.trabajadores && hydratedFormData?.trabajadores.length > 0) {
      console.log("[v0] Inicializacion: Verificando sincronizacion de trabajadores con grupos")
      updateTrabajadoresAndGrupos(
        hydratedFormData.trabajadores, // Use loaded workers
        setTrabajadores,
        hydratedFormData.empresa?.grupos || [], // Use loaded groups
        setGrupos,
        ensureGrupoByName,
      )
    }
    // </CHANGE>

    // Set default turns if none are loaded
    if (formData.turnos.length === 0) {
      setFormData((prev) => ({ ...prev, turnos: DEFAULT_TURNOS }))
    }

    // Set default planning days if none are loaded
    if (formData.planificaciones.length > 0) {
      const defaultTurno = DEFAULT_TURNOS.find((t) => t.nombre.toLowerCase() === "libre") || DEFAULT_TURNOS[0] // Fallback to the first default turn
      const defaultTurnoId = defaultTurno ? defaultTurno.id : null // Ensure defaultTurno is not undefined

      if (defaultTurnoId !== undefined) {
        // Set default diasTurnos for existing planificaciones if they are empty
        const updatedPlanificaciones = formData.planificaciones.map((plan) => {
          if (!plan.diasTurnos || plan.diasTurnos.length === 0) {
            return {
              ...plan,
              diasTurnos: Array(7).fill(defaultTurnoId),
            }
          }
          return plan
        })
        setFormData((prev) => ({ ...prev, planificaciones: updatedPlanificaciones }))
      }
    }

    // Set initialization as complete
    console.log("[v0] Setting isInitialized to true")
    setIsInitialized(true)
    console.log("[v0] isInitialized set to true")
  }

  const handleFinalizar = useCallback(async () => {
    setIsSubmitting(true)
    setValidationErrors([])

    try {
      console.log("[v0] ===== INICIANDO FINALIZACIÓN DEL ONBOARDING =====")
      console.log("[v0] onboardingId:", onboardingId)
      console.log("[v0] idZoho:", idZoho)
      console.log("[v0] formData:", formData)

      const newHistory = [...navigationHistory, 11]

      const updatedFormData = {
        ...formData,
        trabajadores: trabajadores, // Sync trabajadores from state
        empresa: {
          ...normalizeEmpresaModulos(formData.empresa),
          grupos: grupos, // Sync grupos from state
        },
      }

      console.log("[v0] handleFinalizar: Trabajadores a guardar:", trabajadores.length)
      console.log("[v0] handleFinalizar: Grupos a guardar:", grupos.length)
      // </CHANGE>

      const dataToSave = {
        formData: updatedFormData, // Use updatedFormData instead of formData
        currentStep: 11,
        lastStep: 11,
        navigationHistory: newHistory,
        estado: getEstadoByStep(11),
        totalTrabajadores: trabajadores.length,
        fecha_completado: new Date().toISOString(),
        // Make sure to save the updated groups and workers too
        trabajadores: trabajadores,
        empresa: { ...formData.empresa, grupos: grupos },
        turnos: formData.turnos, // Ensure turns are saved
        planificaciones: formData.planificaciones, // Ensure planificaciones are saved
        asignaciones: formData.asignaciones, // Ensure asignaciones are saved
      }

      // Marcar como completado en BD
      if (onboardingId) {
        console.log("[v0] handleFinalizar: Guardando en BD...")
        const dbPromise = fetch(`/api/onboarding/${onboardingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: stringifyPayload(dataToSave),
        })

        await dbPromise
        console.log("[v0] handleFinalizar: ✅ Onboarding marcado como completado en BD")
      }

      // Preparar payload para Zoho (mismo JSON que se guardó en BD + metadata adicional)
      const zohoPayload = {
        accion: "completado",
        eventType: "complete",
        id_zoho: idZoho,
        onboardingId: onboardingId,
        fechaHoraEnvio: new Date().toISOString(),
        formData: updatedFormData,
        metadata: {
          empresaRut: formData.empresa.rut || "Sin RUT",
          empresaNombre: formData.empresa.razonSocial || formData.empresa.nombreFantasia || "Sin nombre",
          pasoActual: 11,
          pasoNombre: steps[11]?.label || "Completado",
          totalPasos: steps.length,
          porcentajeProgreso: 100,
          totalTrabajadores: trabajadores.length,
          totalGrupos: grupos.length,
        },
        currentStep: 11,
        navigationHistory: newHistory,
        estado: getEstadoByStep(11),
        fecha_completado: dataToSave.fecha_completado,
        excelUrls: {
          usuarios: { filename: "", url: "" },
          planificaciones: { filename: "", url: "" },
        },
        excelUrlUsuarios: "",
        excelUrlPlanificaciones: "",
        excelFile: null,
      }

      console.log("[v0] handleFinalizar: Payload para Zoho:", stringifyPayload(zohoPayload, true))
      console.log("[v0] handleFinalizar: Enviando a /api/submit-to-zoho...")

      const zohoResponse = await fetch("/api/submit-to-zoho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stringifyPayload(zohoPayload),
      })

      console.log("[v0] handleFinalizar: Status del envío:", zohoResponse.status, zohoResponse.statusText)

      const zohoResult = await zohoResponse.json()
      console.log("[v0] handleFinalizar: Respuesta de Zoho:", zohoResult)

      if (zohoResult.success) {
        console.log("[v0] handleFinalizar: ✅ Datos enviados exitosamente a Zoho")
      } else {
        console.error("[v0] handleFinalizar: ❌ Error al enviar a Zoho:", zohoResult.error)
        toast({
          title: "Error al enviar a Zoho",
          description: "Hubo un problema al registrar la finalización en Zoho.",
          variant: "destructive",
        })
      }
      // </CHANGE>

      // Navegar a página de agradecimiento
      setCurrentStep(11)
      setNavigationHistory(newHistory)
      setCompletedSteps((prev) => [...prev, currentStep])
    } catch (error) {
      console.error("[v0] handleFinalizar: ❌ ERROR CRÍTICO:", error)
      toast({
        title: "Error",
        description: "Hubo un error al finalizar el onboarding",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    formData,
    idZoho,
    steps.length,
    onboardingId,
    navigationHistory,
    toast,
    currentStep,
    setCompletedSteps,
    setCurrentStep,
    setNavigationHistory,
    trabajadores, // Include workers and groups for saving
    grupos,
  ])

  const goNext = useCallback(async () => {
    const nextStep = currentStep + 1
    const newHistory = [...navigationHistory, nextStep]

    let isValid = true
    const errors: string[] = []
    const stepErrors: Record<string, string> = {}

    switch (currentStep) {
      case 0: // Bienvenida - No validation needed
        break
      case 1: // Antes de comenzar - No validation needed
        break
      case 2: // Empresa
        const empresaValidation = validateEmpresaFields(formData.empresa)
        if (!empresaValidation.isValid) {
          isValid = false
          // Crear mensajes de error específicos para cada campo
          empresaValidation.errors.forEach((err) => {
            errors.push(err)
            // Mapear el error al campo específico
            if (err.includes("Razón Social")) stepErrors["empresa.razonSocial"] = "Este campo es obligatorio"
            if (err.includes("Nombre de fantasía")) stepErrors["empresa.nombreFantasia"] = "Este campo es obligatorio"
            if (err.includes("RUT (formato invalido)")) {
              stepErrors["empresa.rut"] = "Formato invalido (ej: 12345678-9)"
            } else if (err.includes("RUT")) {
              stepErrors["empresa.rut"] = "Este campo es obligatorio"
            }
            if (err.includes("Giro")) stepErrors["empresa.giro"] = "Este campo es obligatorio"
            if (err.includes("Dirección")) stepErrors["empresa.direccion"] = "Este campo es obligatorio"
            if (err.includes("Comuna")) stepErrors["empresa.comuna"] = "Este campo es obligatorio"
            if (err.includes("Teléfono")) stepErrors["empresa.telefonoContacto"] = "Este campo es obligatorio"
            if (err.includes("Rubro")) stepErrors["empresa.rubro"] = "Este campo es obligatorio"
            if (err.includes("Sistema"))
              stepErrors["empresa.sistema"] = "Debes seleccionar al menos un sistema de marcaje"
            if (err.includes("Modulos adicionales (Otro)"))
              stepErrors["empresa.modulosAdicionalesOtro"] = "Debes especificar el modulo en Otro"
            if (err.includes("Email de facturación (formato inválido)")) {
              stepErrors["empresa.emailFacturacion"] = "Formato de email inválido (ej: correo@empresa.cl)"
            } else if (err.includes("Email de facturación")) {
              stepErrors["empresa.emailFacturacion"] = "Este campo es obligatorio"
            }
          })
        }
        break
      case 3: // Admin
        const adminValidation = validateAdminsFields(formData.admins)
        if (!adminValidation.isValid) {
          isValid = false
          errors.push(...adminValidation.errors)
          setNoAdminsError(true)
        } else {
          setNoAdminsError(false)
        }
        break
      case 4:
        // This step handles its own navigation via onDecision.
        break
      case 5: // Trabajadores
        if (trabajadores.length === 0) {
          isValid = false
          errors.push("Debes agregar al menos un trabajador.")
        }

        const trabajadoresInvalidos = trabajadores.filter((t) => {
          if (t.tipo !== "administrador") {
            const nombre = t.nombre?.trim() || ""
            const rut = t.rut?.trim() || ""
            const correo = t.correo?.trim() || ""
        
            if (!nombre) return true
            if (!rut) return true
            if (!isRutFormatValid(rut) || !isValidRut(rut)) return true
            if (!correo) return true
            if (!isValidEmail(correo)) return true
            if (!t.grupoId) return true
          }
        
          if (t.telefono1?.trim() && !isValidPhone(t.telefono1)) return true
          if (t.telefono2?.trim() && !isValidPhone(t.telefono2)) return true
          if (t.telefono3?.trim() && !isValidPhone(t.telefono3)) return true
          return false
        })

        if (trabajadoresInvalidos.length > 0) {
          isValid = false
          errors.push("Hay trabajadores con datos inv?lidos. Revisa nombre, RUT, correo, grupo y tel?fonos.")
          break
        }

        const isCallSelected = formData?.empresa?.sistema?.includes("GeoVictoria CALL")
        if (isCallSelected) {
          const trabajadoresSinTelefono = trabajadores.filter(
            (t) => t.tipo !== "administrador" && !t.telefono1?.trim(),
          )
          const missingCount = trabajadoresSinTelefono.length
          const telefonoDeferred = telefonoCallDeferredRef.current || formData.telefonoCallDeferred
          if (missingCount > 0 && !telefonoDeferred && !skipCallPhoneCheckRef.current) {
            setTelefonoCallMissingCount(missingCount)
            setTelefonoCallConfirmChecked(false)
            setShowTelefonoCallModal(true)
            return
          }
          if (missingCount === 0 && telefonoDeferred) {
            telefonoCallDeferredRef.current = false
            setFormData((prev) => ({ ...prev, telefonoCallDeferred: false }))
          }
        } else if (formData.telefonoCallDeferred) {
          telefonoCallDeferredRef.current = false
          setFormData((prev) => ({ ...prev, telefonoCallDeferred: false }))
        }
        skipCallPhoneCheckRef.current = false
        break
      case 6:
        // This step handles its own navigation via onDecision.
        break
      case 7: // Turnos
        const hasCustomOrDefaultTurn =
          formData.turnos.length > 0 &&
          (formData.turnos.some((t) => !["descanso", "libre", "presencial"].includes(t.nombre.toLowerCase())) ||
            DEFAULT_TURNOS.some((dt) =>
              formData.turnos.some((ft) => ft.nombre.toLowerCase() === dt.nombre.toLowerCase()),
            ))

        if (!hasCustomOrDefaultTurn) {
          isValid = false
          errors.push("Debes tener al menos un turno definido. Se recomienda uno 'Libre' o 'Descanso'.")
        }
        break
      case 8: // Planificaciones
        if (formData.configureNow && formData.turnos.length > 0 && formData.planificaciones.length === 0) {
          isValid = false
          errors.push("Debes crear al menos una planificación para continuar.")
        }
        break
      case 9: // Asignaciones
        if (formData.configureNow) {
          const workersWithoutAssignment = trabajadores.filter(
            (t) =>
              !formData.asignaciones.some((a) => a.trabajadorId === t.id && a.planificacionId && a.desde && a.hasta),
          )
          if (workersWithoutAssignment.length > 0) {
            isValid = false
            errors.push("Todos los trabajadores deben tener una asignación de planificación válida.")
          }
        }
        break
      case 10: // Resumen
        return
      default:
        break
    }

    if (!isValid) {
      setValidationErrors(errors)
      setFieldErrors(stepErrors)
      toast({
        title: "Campos inválidos",
        description: "Por favor, corrige los errores en los campos marcados.",
        variant: "destructive",
      })
      return
    }
    setValidationErrors([])
    setFieldErrors({})
    setNoAdminsError(false)

    const hasSelectedModulos =
      Array.isArray(formData.empresa.modulosAdicionales) && formData.empresa.modulosAdicionales.length > 0
    if (currentStep === 2 && !hasSelectedModulos && !skipModulosUpsellRef.current) {
      setShowModulosUpsellModal(true)
      return
    }
    skipModulosUpsellRef.current = false
    // </CHANGE>

    setIsSubmitting(true)
    try {
      if (onboardingId) {
        try {
        console.log("[v0] goNext: Guardando avance en BD", {
          step: nextStep,
          onboardingId,
        })

        const telefonoCallDeferred = telefonoCallDeferredRef.current || formData.telefonoCallDeferred

        const updatedFormData = {
          ...formData,
          telefonoCallDeferred,
          trabajadores: trabajadores, // Sync trabajadores from state
          empresa: {
            ...normalizeEmpresaModulos(formData.empresa),
            grupos: grupos, // Sync grupos from state
          },
        }

        console.log("[v0] goNext: Trabajadores a guardar:", trabajadores.length)
        console.log("[v0] goNext: Grupos a guardar:", grupos.length)
        // </CHANGE>

        const dataToSave = {
          formData: updatedFormData, // Use updatedFormData instead of formData
          currentStep: nextStep,
          lastStep: nextStep,
          navigationHistory: newHistory,
          estado: getEstadoByStep(nextStep),
          totalTrabajadores: trabajadores.length,
        }

        // Guardar en BD
        const dbPromise = fetch(`/api/onboarding/${onboardingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: stringifyPayload(dataToSave),
        })

        // Enviar a Zoho en paralelo (mismo JSON que se guarda en BD)
        const zohoPayload = {
          accion: "progreso",
          eventType: "progress",
          id_zoho: idZoho,
          onboardingId: onboardingId,
          fechaHoraEnvio: new Date().toISOString(),
          formData: updatedFormData,
          metadata: {
            empresaRut: formData.empresa.rut || "Sin RUT",
            empresaNombre: formData.empresa.razonSocial || formData.empresa.nombreFantasia || "Sin nombre",
            pasoActual: nextStep,
            pasoNombre: steps[nextStep]?.label || "Paso " + nextStep,
            totalPasos: steps.length,
            porcentajeProgreso: Math.round((nextStep / steps.length) * 100),
            totalTrabajadores: trabajadores.length, // Add worker count to metadata
            totalGrupos: grupos.length, // Add group count to metadata
          },
          currentStep: nextStep,
          navigationHistory: newHistory,
          estado: getEstadoByStep(nextStep),
          fecha_completado: null,
          excelUrls: {
            usuarios: { filename: "", url: "" },
            planificaciones: { filename: "", url: "" },
          },
          excelUrlUsuarios: "",
          excelUrlPlanificaciones: "",
          excelFile: null,
        }

        const zohoPromise = fetch("/api/submit-to-zoho", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: stringifyPayload(zohoPayload),
        })

        // Esperar ambas peticiones
        const [dbResponse, zohoResponse] = await Promise.all([dbPromise, zohoPromise])

        if (!dbResponse.ok) {
          console.error("[v0] goNext: Error guardando en BD", await dbResponse.text())
          toast({
            title: "Error al guardar",
            description: "No se pudo guardar el progreso, pero puedes continuar.",
            variant: "destructive",
          })
        } else {
          console.log("[v0] goNext: ✅ Guardado exitoso en BD")
        }

        if (zohoResponse.ok) {
          console.log("[v0] goNext: ✅ Progreso enviado a Zoho")
        } else {
          console.warn("[v0] goNext: ⚠️ No se pudo enviar progreso a Zoho (no bloqueante)")
        }
        // </CHANGE>
      } catch (error) {
        console.error("[v0] goNext: Error en fetch:", error)
        toast({
          title: "Error de conexión",
          description: "No se pudo conectar con el servidor.",
          variant: "destructive",
        })
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    } finally {
      setIsSubmitting(false)
    }

    // If valid, proceed
    setCurrentStep(nextStep)
    setNavigationHistory(newHistory)
    setCompletedSteps((prev) => [...prev, currentStep]) // Mark current step as completed
  }, [
    currentStep,
    formData,
    navigationHistory,
    onboardingId,
    setCompletedSteps,
    setCurrentStep,
    setNavigationHistory,
    setValidationErrors,
    setFieldErrors,
    toast,
    setNoAdminsError,
    setGrupos,
    steps.length,
    idZoho,
    trabajadores, // Include workers and groups for saving
    grupos,
    // Add steps array to dependencies as it's used in metadata for handleFinalizar & goNext
    steps,
    isFieldPrefilled, // Added to dependencies
    trackFieldChange, // Added to dependencies
    isFieldEdited, // Added to dependencies
    setEmpresa, // Added to dependencies
    setFormData,
    setShowModulosUpsellModal,
    setShowTelefonoCallModal,
    setTelefonoCallMissingCount,
    setTelefonoCallConfirmChecked,
    DEFAULT_TURNOS, // Added to dependencies
  ])

  const goBack = useCallback(() => {
    if (navigationHistory.length <= 1) return // Cannot go back further than the first step

    const previousStep = navigationHistory[navigationHistory.length - 2]
    setValidationErrors([])
    setFieldErrors({})
    setNoAdminsError(false)
    setNavigationHistory((prev) => prev.slice(0, -1)) // Remove current step from history
    setCurrentStep(previousStep)
  }, [navigationHistory, setCurrentStep, setNavigationHistory, setFieldErrors, setValidationErrors, setNoAdminsError])

  // Helper to render navigation buttons
  const NavigationButtons = ({ showNext = true }: { showNext?: boolean }) => (
    <div className="mt-8 flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={goBack}
        disabled={isSubmitting || currentStep === PRIMER_PASO || navigationHistory.length <= 1}
        className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <ArrowLeft className="w-5 h-5" />
        Atrás
      </button>
      {showNext &&
        currentStep < steps.length - 1 && // Don't show "Next" on the last step before completion
        !(currentStep === 1 || currentStep === 4 || currentStep === 6) && ( // Hide Next for decision steps
          <button
            type="button"
            onClick={goNext}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-8 py-3 text-base font-semibold text-white hover:bg-sky-600 transition-colors shadow-lg shadow-sky-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continuar
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
      {currentStep === steps.length - 2 && ( // Special case for the "Resumen" step's "Finalizar" button
        <button
          type="button"
          onClick={handleFinalizar} // This should trigger the final submission
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-8 py-3 text-base font-semibold text-white hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Confirmar y Enviar
          <Check className="w-5 h-5" />
        </button>
      )}
    </div>
  )

  // Helper to render step content
  const renderStepContent = () => {
    // Initial loading state
    if (!isInitialized) {
      console.log("[v0] renderStepContent: Still loading, isInitialized =", isInitialized)
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
            <p className="text-sm text-slate-600">Cargando...</p>
          </div>
        </div>
      )
    }

    console.log("[v0] renderStepContent: Rendering step", currentStep)

    switch (currentStep) {
      case 0:
        return <BienvenidaMarketingStep onContinue={goNext} nombreEmpresa={formData.empresa.razonSocial} />
      case 1:
        // CHANGE: Corrected step numbering and component for case 1
        return (
          <>
            <AntesDeComenzarStep onContinue={goNext} onBack={goBack} />
          </>
        )

      case 2:
        // CHANGE: Empresa step is now case 2
        return (
          <div className="space-y-6">
            {validationErrors.length > 0 && (
              <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900 text-sm">Faltan campos obligatorios</h3>
                    <ul className="mt-2 text-xs text-red-700 space-y-1">
                      {validationErrors.map((error, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600"></span>
                          {error}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            {/* </CHANGE> */}
            <EmpresaStep
              empresa={formData.empresa}
              setEmpresa={setEmpresa}
              prefilledFields={prefilledFields}
              isFieldPrefilled={isFieldPrefilled}
              isFieldEdited={isFieldEdited}
              trackFieldChange={trackFieldChange}
              fieldErrors={Object.keys(fieldErrors).reduce(
                (acc, key) => {
                  if (key.startsWith("empresa.")) {
                    acc[key] = fieldErrors[key]
                  }
                  return acc
                },
                {} as Record<string, string>,
              )}
            />
            <NavigationButtons />
          </div>
        )

      case 3: // Admin (Paso 3)
        return (
          <div className="space-y-6">
            {noAdminsError && (
              <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-red-900 text-sm">Administrador requerido</h3>
                    <p className="mt-1 text-xs text-red-700">
                      Debes agregar al menos un administrador para continuar con el onboarding.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {/* </CHANGE> */}
            <AdminStep
              admins={formData.admins}
              setAdmins={(updater) => {
                setFormData((prev) => ({
                  ...prev,
                  admins: typeof updater === "function" ? updater(prev.admins) : updater,
                }))
              }}
              onRemoveAdmin={removeAdmin}
              isEditMode={false}
            />
            <NavigationButtons />
          </div>
        )
      case 4:
        return (
          <div className="space-y-6">
            <WorkersDecisionStep onDecision={handleWorkersDecision} />
            <NavigationButtons />
          </div>
        )

      case 5: // Trabajadores (Paso 5)
        return (
          <div className="space-y-6">
            {validationErrors.length > 0 && (
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-amber-900 text-sm">Trabajadores requeridos</h3>
                    <p className="mt-1 text-xs text-amber-700">{validationErrors[0]}</p>
                  </div>
                </div>
              </div>
            )}
            {/* </CHANGE> */}
            <StepErrorBoundary onReset={() => setTrabajadoresStepKey((prev) => prev + 1)} key={trabajadoresStepKey}>
              <TrabajadoresStep
                trabajadores={trabajadores} // Use the state variable directly
                setTrabajadores={setTrabajadores} // Use the state setter directly
                grupos={grupos}
                setGrupos={(newGrupos) =>
                  setFormData((prev) => ({
                    ...prev,
                    empresa: { ...prev.empresa, grupos: newGrupos },
                  }))
                }
                errorGlobal={validationErrors.join(" ")}
                fieldErrors={fieldErrors} // Pass fieldErrors down
                formData={formData} // Pass formData down
                ensureGrupoByName={ensureGrupoByName}
              />
            </StepErrorBoundary>
            <NavigationButtons />
          </div>
        )
      case 6:
        return (
          <div className="space-y-6">
            <DecisionStep onDecision={handleConfigurationDecision} />
            <NavigationButtons />
          </div>
        )

      case 7:
        return (
          <>
            <TurnosStep
              turnos={formData.turnos}
              setTurnos={(newTurnos) => setFormData((prev) => ({ ...prev, turnos: newTurnos }))}
            />
            <NavigationButtons />
          </>
        )
      case 8:
        return (
          <>
            <PlanificacionesStep
              planificaciones={formData.planificaciones}
              setPlanificaciones={(newPlanificaciones) =>
                setFormData((prev) => ({ ...prev, planificaciones: newPlanificaciones }))
              }
              turnos={formData.turnos}
            />
            <NavigationButtons />
          </>
        )
      case 9: {
        console.log("[v0] Renderizando AsignacionStep - Trabajadores:", trabajadores.length, "Grupos:", grupos.length)
        console.log(
          "[v0] Primeros 3 trabajadores con grupoId:",
          trabajadores.slice(0, 3).map((t) => ({
            nombre: t.nombre,
            grupoId: t.grupoId,
          })),
        )
        console.log(
          "[v0] Grupos disponibles:",
          grupos.map((g) => ({ id: g.id, nombre: g.nombre })),
        )

        return (
          <>
            <AsignacionStep
              asignaciones={formData.asignaciones}
              setAsignaciones={(updater) =>
                setFormData((prev) => ({
                  ...prev,
                  asignaciones: typeof updater === "function" ? updater(prev.asignaciones) : updater,
                }))
              }
              trabajadores={trabajadores}
              planificaciones={formData.planificaciones}
              grupos={grupos}
              errorGlobal={validationErrors.join(" ")}
            />
            <NavigationButtons />
          </>
        )
      }

      case 10: // Resumen
        return (
          <section className="space-y-6">
            <header>
              <h2 className="text-lg font-semibold text-slate-900">Resumen</h2>
              <p className="mt-1 text-sm text-slate-600">
                ¡Casi terminamos! Revisa los datos ingresados antes de finalizar.
              </p>
            </header>
            {/* Display summary of entered data */}
            <div className="grid gap-6">
              {/* Empresa */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-800">Empresa</h3>
                <p>
                  <strong>Razón Social:</strong> {formData.empresa.razonSocial}
                </p>
                <p>
                  <strong>Nombre Fantasía:</strong> {formData.empresa.nombreFantasia}
                </p>
                <p>
                  <strong>RUT:</strong> {formData.empresa.rut}
                </p>
                <p>
                  <strong>Giro:</strong> {formData.empresa.giro}
                </p>
                <p>
                  <strong>Dirección:</strong> {formData.empresa.direccion}, {formData.empresa.comuna}
                </p>
                <p>
                  <strong>Email Facturación:</strong> {formData.empresa.emailFacturacion}
                </p>
                <p>
                  <strong>Teléfono Contacto:</strong> {formData.empresa.telefonoContacto}
                </p>
                <p>
                  <strong>Sistema(s):</strong> {formData.empresa.sistema.join(", ") || "No seleccionado"}
                </p>
                <p>
                  <strong>Modulos adicionales:</strong> {formData.empresa.modulosAdicionales?.join(", ") || "No seleccionado"}
                  {formData.empresa.modulosAdicionales?.includes("Otro") && formData.empresa.modulosAdicionalesOtro
                    ? ` (Otro: ${formData.empresa.modulosAdicionalesOtro})`
                    : ""}
                </p>
                <p>
                  <strong>Rubro:</strong> {formData.empresa.rubro || "No seleccionado"}
                </p>
              </div>

              {/* Administradores */}
              {formData.admins.length > 0 && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">Administradores</h3>
                  <ul>
                    {formData.admins.map((admin, index) => (
                      <li key={admin.id || index} className="mb-2 text-sm">
                        <strong>{admin.nombre}</strong> (RUT: {admin.rut}, Email: {admin.email}, Tel: {admin.telefono})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Trabajadores */}
              {trabajadores.length > 0 && ( // Use the state variable directly
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">Trabajadores ({trabajadores.length})</h3>
                  <p className="text-sm">
                    (Detalle completo se puede ver en el paso de Trabajadores)
                    {/* Optionally display a few worker names */}
                  </p>
                </div>
              )}

              {/* Grupos */}
              {formData.empresa.grupos.length > 0 && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">Grupos ({formData.empresa.grupos.length})</h3>
                  <ul>
                    {formData.empresa.grupos.map((grupo) => (
                      <li key={grupo.id} className="mb-2 text-sm">
                        <strong>{grupo.nombre}</strong>
                        {grupo.descripcion && `: ${grupo.descripcion}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Turnos */}
              {formData.turnos.filter(
                (t) => t.nombre.toLowerCase() !== "descanso" && t.nombre.toLowerCase() !== "libre",
              ).length > 0 && ( // Exclude default 'Descanso' and 'Libre' for cleaner summary
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">Turnos definidos</h3>
                  <ul>
                    {formData.turnos
                      .filter((t) => t.nombre.toLowerCase() !== "descanso" && t.nombre.toLowerCase() !== "libre")
                      .map((turno) => (
                        <li key={turno.id} className="mb-2 text-sm">
                          <strong>{turno.nombre}</strong>: {turno.horaInicio} - {turno.horaFin}
                          {turno.tipoColacion !== "sin" && (
                            <span>
                              {" ("}
                              {turno.tipoColacion === "libre"
                                ? `${turno.colacionMinutos} min libre`
                                : `${turno.colacionInicio} - ${turno.colacionFin} fija`}
                              {")"}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {/* Planificaciones */}
              {formData.planificaciones.length > 0 && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Planificaciones ({formData.planificaciones.length})
                  </h3>
                  <ul>
                    {formData.planificaciones.map((plan) => (
                      <li key={plan.id} className="mb-2 text-sm">
                        <strong>{plan.nombre}</strong>
                        {/* Optionally show assigned turns */}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Asignaciones */}
              {formData.asignaciones.length > 0 && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Asignaciones ({formData.asignaciones.length})
                  </h3>
                  <p className="text-sm">(Detalle completo se puede ver en el paso de Asignaciones)</p>
                </div>
              )}
            </div>
            <div className="flex justify-center items-center gap-4 py-6">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-100"
              >
                <ArrowLeft className="w-5 h-5" />
                Atrás
              </button>
              <button
                type="button"
                onClick={handleFinalizar}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-8 py-3 text-base font-semibold text-white hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/25"
              >
                Confirmar y Enviar
                <Check className="w-5 h-5" />
              </button>
            </div>
          </section>
        )
      case 11: // Agradecimiento
        return (
          <section className="space-y-6 text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30 mx-auto">
              <Check className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-800">
              ¡Gracias por la información!
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Ya estamos listos para crear tu empresa en GeoVictoria y comenzar tu implementación.
            </p>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Pronto te llegará un correo con todos los detalles para avanzar.
            </p>
          </section>
        )
      default:
        return <p>Paso no encontrado.</p>
    }
  }

  // CHANGE: Added async to handleWorkersDecision and handleConfigurationDecision
  const handleWorkersDecision = async (decision: "now" | "later") => {
    const loadNow = decision === "now"
    const updatedFormData = {
      ...formData,
      loadWorkersNow: loadNow,
      empresa: normalizeEmpresaModulos(formData.empresa),
    }
    setFormData(updatedFormData)

    // Determinar el siguiente paso
    const nextStep = loadNow ? currentStep + 1 : 6 // Si carga ahora va al paso 5, si no va al paso 6
    const newHistory = [...navigationHistory, nextStep]

    // Guardar decisión en BD y enviar a Zoho
    setIsSubmitting(true)
    try {
      if (onboardingId) {
        try {
        console.log("[v0] handleWorkersDecision: Guardando decisión en BD...")

        const dataToSave = {
          formData: updatedFormData,
          currentStep: nextStep,
          lastStep: nextStep,
          navigationHistory: newHistory,
          estado: getEstadoByStep(nextStep),
        }

        // Guardar en BD
        const dbPromise = fetch(`/api/onboarding/${onboardingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dataToSave),
        })

        // Enviar a Zoho en paralelo
        const zohoPayload = {
          accion: "progreso",
          eventType: "progress",
          id_zoho: idZoho,
          fechaHoraEnvio: new Date().toISOString(),
          formData: updatedFormData,
          metadata: {
            empresaRut: updatedFormData.empresa.rut || "Sin RUT",
            empresaNombre:
              updatedFormData.empresa.razonSocial || updatedFormData.empresa.nombreFantasia || "Sin nombre",
            pasoActual: nextStep,
            pasoNombre: steps[nextStep]?.label || "Paso " + nextStep,
            totalPasos: steps.length,
            porcentajeProgreso: Math.round((nextStep / steps.length) * 100),
            decision: loadNow ? "Cargar trabajadores ahora" : "Cargar trabajadores en capacitación",
          },
          currentStep: nextStep,
          navigationHistory: newHistory,
          estado: getEstadoByStep(nextStep),
        }

        const zohoPromise = fetch("/api/submit-to-zoho", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(zohoPayload),
        })

        const [dbResponse, zohoResponse] = await Promise.all([dbPromise, zohoPromise])

        if (dbResponse.ok) {
          console.log("[v0] handleWorkersDecision: ✅ Decisión guardada en BD")
        } else {
          console.error("[v0] handleWorkersDecision: Error guardando en BD", await dbResponse.text())
        }

        if (zohoResponse.ok) {
          console.log("[v0] handleWorkersDecision: ✅ Decisión enviada a Zoho")
        } else {
          console.warn("[v0] handleWorkersDecision: ⚠️ No se pudo enviar a Zoho")
        }
      } catch (error) {
        console.error("[v0] handleWorkersDecision: Error:", error)
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    } finally {
      setIsSubmitting(false)
    }

    // Navegar al siguiente paso
    if (loadNow) {
      setCurrentStep(nextStep)
      setNavigationHistory(newHistory)
      setCompletedSteps((prev) => [...new Set([...prev, currentStep])])
    } else {
      setCurrentStep(6)
      setNavigationHistory((prev) => [...prev, 6])
      setCompletedSteps((prev) => [...new Set([...prev, currentStep])])
    }
  }

  const handleConfigurationDecision = async (decision: "now" | "later") => {
    const configureNow = decision === "now"
    const updatedFormData = {
      ...formData,
      configureNow: configureNow,
      empresa: normalizeEmpresaModulos(formData.empresa),
    }
    setFormData(updatedFormData)

    // Determinar el siguiente paso
    const nextStep = configureNow ? currentStep + 1 : 10 // Si configura ahora va al paso 7, si no va al paso 10
    const newHistory = configureNow ? [...navigationHistory, nextStep] : [...navigationHistory.slice(0, -1), 10]

    // Guardar decisión en BD y enviar a Zoho
    setIsSubmitting(true)
    try {
      if (onboardingId) {
        try {
        console.log("[v0] handleConfigurationDecision: Guardando decisión en BD...")

        const dataToSave = {
          formData: updatedFormData,
          currentStep: nextStep,
          lastStep: nextStep,
          navigationHistory: newHistory,
          estado: getEstadoByStep(nextStep),
        }

        // Guardar en BD
        const dbPromise = fetch(`/api/onboarding/${onboardingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dataToSave),
        })

        // Enviar a Zoho en paralelo
        const zohoPayload = {
          accion: "progreso",
          eventType: "progress",
          id_zoho: idZoho,
          fechaHoraEnvio: new Date().toISOString(),
          formData: updatedFormData,
          metadata: {
            empresaRut: updatedFormData.empresa.rut || "Sin RUT",
            empresaNombre:
              updatedFormData.empresa.razonSocial || updatedFormData.empresa.nombreFantasia || "Sin nombre",
            pasoActual: nextStep,
            pasoNombre: steps[nextStep]?.label || "Paso " + nextStep,
            totalPasos: steps.length,
            porcentajeProgreso: Math.round((nextStep / steps.length) * 100),
            decision: configureNow ? "Configurar turnos ahora" : "Configurar turnos en capacitación",
          },
          currentStep: nextStep,
          navigationHistory: newHistory,
          estado: getEstadoByStep(nextStep),
        }

        const zohoPromise = fetch("/api/submit-to-zoho", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(zohoPayload),
        })

        const [dbResponse, zohoResponse] = await Promise.all([dbPromise, zohoPromise])

        if (dbResponse.ok) {
          console.log("[v0] handleConfigurationDecision: ✅ Decisión guardada en BD")
        } else {
          console.error("[v0] handleConfigurationDecision: Error guardando en BD", await dbResponse.text())
        }

        if (zohoResponse.ok) {
          console.log("[v0] handleConfigurationDecision: ✅ Decisión enviada a Zoho")
        } else {
          console.warn("[v0] handleConfigurationDecision: ⚠️ No se pudo enviar a Zoho")
        }
      } catch (error) {
        console.error("[v0] handleConfigurationDecision: Error:", error)
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    } finally {
      setIsSubmitting(false)
    }

    // Navegar al siguiente paso
    if (configureNow) {
      setCurrentStep(nextStep)
      setNavigationHistory(newHistory)
      setCompletedSteps((prev) => [...new Set([...prev, currentStep])])
    } else {
      setCurrentStep(10)
      setNavigationHistory(newHistory)
      setCompletedSteps((prev) => [...new Set([...prev, currentStep, 7, 8, 9])])
    }
  }
  // </CHANGE>

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {isSubmitting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-5 shadow-xl">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
            <div className="text-sm font-medium text-slate-800">Guardando cambios...</div>
            <div className="text-xs text-slate-500">Esto puede tardar unos segundos.</div>
          </div>
        </div>
      )}

      {showResumeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100">
                <svg className="h-6 w-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">¡Bienvenido de vuelta!</h3>
            </div>
            <p className="mb-6 text-sm text-slate-600">
              Retomaremos tu configuración en <strong>"{resumeStepName}"</strong> para que continúes justo donde la
              dejaste. Tus datos previos siguen guardados y los podrás revisar antes de avanzar.
            </p>
            <button
              onClick={() => setShowResumeModal(false)}
              className="w-full rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      <Dialog open={showTelefonoCallModal} onOpenChange={setShowTelefonoCallModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Teléfono recomendado para Marcaje por Llamada</DialogTitle>
            <DialogDescription>
              Seleccionaste Marcaje por Llamada como sistema de marcaje. Por eso recomendamos ingresar el Teléfono 1 de cada trabajador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Trabajadores sin Teléfono 1: <span className="font-semibold">{telefonoCallMissingCount}</span>
            </p>
            <p>
              Si aún no tienes esos números, puedes continuar y completarlos más adelante. Sin teléfono, los
              trabajadores no podrán marcar asistencia por llamada.
            </p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={telefonoCallConfirmChecked}
                onChange={(e) => setTelefonoCallConfirmChecked(e.target.checked)}
              />
              <span>
                Confirmo que completaré los teléfonos más adelante para habilitar el Marcaje por Llamada.
              </span>
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button type="button" variant="outline" onClick={() => setShowTelefonoCallModal(false)}>
              Completar ahora
            </Button>
            <Button
              type="button"
              disabled={!telefonoCallConfirmChecked}
              onClick={() => {
                telefonoCallDeferredRef.current = true
                setFormData((prev) => ({ ...prev, telefonoCallDeferred: true }))
                skipCallPhoneCheckRef.current = true
                setShowTelefonoCallModal(false)
                setTelefonoCallConfirmChecked(false)
                goNext()
              }}
            >
              Continuar sin teléfonos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModulosUpsellModal} onOpenChange={setShowModulosUpsellModal}>
        <DialogContent className="sm:max-w-xl overflow-hidden">
          <DialogHeader className="-mx-6 -mt-6 border-b border-sky-100 bg-gradient-to-r from-sky-50 via-cyan-50 to-emerald-50 px-6 py-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px] sm:items-start">
              <div>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-700">
                  <Rocket className="h-3.5 w-3.5" />
                  Recomendado para potenciar resultados
                </div>
                <DialogTitle className="mt-3 text-2xl leading-tight text-slate-900 sm:whitespace-nowrap">
                  Dale mas valor a tu gestion
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-700">
                  Activa modulos adicionales y construye una solucion mas completa para tu operacion.
                </DialogDescription>
              </div>
              <div
                className="mx-auto h-32 w-32 rounded-full bg-contain bg-center bg-no-repeat sm:mx-0 sm:justify-self-end"
                style={{ backgroundImage: "url('/images/upsell-agent.png')" }}
                aria-hidden="true"
              />
            </div>
          </DialogHeader>
          <div className="space-y-3 pt-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Que ganas al seleccionarlos ahora:</p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <p>Visualiza indicadores clave con Dashboard BI y toma decisiones mas rapidas.</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <p>Digitaliza procesos con Gestor Documental, Alertas y Permisos y Vacaciones.</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <p>Planifica mejor la dotacion con Planificador Inteligente.</p>
              </div>
            </div>
            <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-slate-700">
              Puedes seleccionarlos ahora y ajustarlos despues con el equipo comercial, sin friccion.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              type="button"
              className="bg-sky-600 text-white hover:bg-sky-700"
              onClick={() => {
                setShowModulosUpsellModal(false)
                if (typeof window !== "undefined") {
                  window.setTimeout(() => {
                    document.getElementById("modulos-adicionales-section")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    })
                  }, 100)
                }
              }}
            >
              Si, quiero potenciarlo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-slate-300"
              onClick={() => {
                skipModulosUpsellRef.current = true
                setShowModulosUpsellModal(false)
                goNext()
              }}
            >
              Continuar sin modulos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <nav className="sticky top-0 z-20 bg-white border-b border-slate-200 py-4 px-6 md:px-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* CHANGE: Actualizado de .svg a .png */}
            <img src="/logo-geovictoria.png" alt="GeoVictoria Logo" className="h-8 w-auto" />
            <h1 className="text-lg font-bold text-slate-800">Configuración Inicial</h1>
          </div>
        </div>
        <div className="mt-4">
          <Stepper currentStep={currentStep} />
        </div>
      </nav>

      {showDesktopNotice && (
        <div className="mx-auto w-full max-w-6xl px-6 md:px-12 mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Recomendado usar computador</p>
                <p className="text-[11px] text-amber-800">
                  Para cargar trabajadores m&aacute;s r&aacute;pido y evitar errores, te sugerimos abrir este enlace desde un PC.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissDesktopNotice}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
            >
              Continuar en m&oacute;vil
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 container mx-auto py-8 px-6 md:px-12">{renderStepContent()}</main>
      <WhatsAppFloatingButton
        phone={formData.empresa.ejecutivoTelefono}
        companyName={formData.empresa.nombreFantasia || formData.empresa.razonSocial}
        onboardingId={onboardingId}
        executiveName={formData.empresa.ejecutivoNombre}
      />
    </div>
  )
}

// CHANGE: Adding export default for deployment
export default OnboardingTurnosCliente
