/**
 * Workflow Actions – Sprint 6
 */
export enum WorkflowAction {
  SUBMIT = 'SUBMIT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  POST = 'POST',
  CANCEL = 'CANCEL',
  CLOSE = 'CLOSE',
}

export const WORKFLOW_ACTIONS: readonly WorkflowAction[] = Object.values(WorkflowAction);
