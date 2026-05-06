/**
 * Shared Admin select options for idle / running / done / error pipelines
 * (Categories merchant/slots, SiteBlueprints design, etc.).
 */
export const workflowIdleRunningDoneErrorSelectOptions = [
  { label: 'Idle', value: 'idle' },
  { label: 'Running', value: 'running' },
  { label: 'Done', value: 'done' },
  { label: 'Error', value: 'error' },
] as const
