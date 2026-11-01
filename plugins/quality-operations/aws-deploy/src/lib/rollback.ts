// What can be said honestly about undoing a deployment. This reads state and explains options; it
// executes nothing. CloudFormation rolls back a failed update by itself; a completed update cannot
// be undone by a command, and data changes are never reversible.
export interface RollbackAdvice {
  stack: string;
  status: string;
  summary: string;
  options: string[];
  /** Commands for the user to run themselves; this plugin never runs them. */
  commandsForYou: string[];
  irreversible: string[];
}

export function adviseRollback(
  stack: string,
  status: string,
  reason: string | null,
  stateful: ReadonlyArray<{ logicalId: string; type: string; reason: string }>,
): RollbackAdvice {
  const irreversible = stateful.map(
    (item) =>
      `${item.logicalId} (${item.type}) ${item.reason}. Changes to its data or its replacement are not undone by redeploying earlier code.`,
  );
  const base = { stack, status, irreversible };
  if (/IN_PROGRESS$/.test(status)) {
    return {
      ...base,
      summary: `An operation is in progress (${status}). Nothing can be started on this stack until it ends.`,
      options: [
        "Wait for it to finish, then run `status` again.",
        "Watch the events with `status`.",
      ],
      commandsForYou: [],
    };
  }
  if (status === "UPDATE_ROLLBACK_FAILED") {
    return {
      ...base,
      summary: `CloudFormation tried to roll the update back and could not (${reason ?? "no reason given"}). The stack is stuck until the cause is fixed.`,
      options: [
        "Read the events to find the resource whose rollback failed and fix its cause (often a resource changed or deleted by hand).",
        "Then continue the rollback; if one resource cannot recover, it can be skipped, at the cost of leaving it out of sync.",
      ],
      commandsForYou: [
        `aws cloudformation continue-update-rollback --stack-name ${stack}`,
        `aws cloudformation continue-update-rollback --stack-name ${stack} --resources-to-skip <LogicalId>`,
      ],
    };
  }
  if (status === "UPDATE_ROLLBACK_COMPLETE") {
    return {
      ...base,
      summary:
        "The last update failed and CloudFormation already rolled the stack back to its previous state. There is nothing to undo.",
      options: [
        "Read the events to see why the update failed, fix it, and deploy again with a new plan.",
      ],
      commandsForYou: [],
    };
  }
  if (status === "ROLLBACK_COMPLETE" || status === "CREATE_FAILED") {
    return {
      ...base,
      summary:
        "The stack failed on creation and cannot be updated, only deleted. No data existed before it, but deleting removes whatever it did create.",
      options: [
        "Read the events for the failing resource and fix it.",
        "Delete the failed stack, then deploy again. Deleting is your decision.",
      ],
      commandsForYou: [`aws cloudformation delete-stack --stack-name ${stack}`],
    };
  }
  if (status === "ROLLBACK_FAILED" || status === "DELETE_FAILED") {
    return {
      ...base,
      summary: `The stack is in ${status}: CloudFormation could not remove some resources.`,
      options: [
        "Read the events for the resources that block it, remove or fix them by hand, then retry the delete (retaining the stuck resources if you accept orphaning them).",
      ],
      commandsForYou: [`aws cloudformation delete-stack --stack-name ${stack}`],
    };
  }
  if (/COMPLETE$/.test(status)) {
    return {
      ...base,
      summary: `The stack is ${status}. A completed deployment is not undone by a command; CloudFormation only rolls back updates that fail.`,
      options: [
        "To return to earlier behavior, revert the code (git), run `plan`, and `deploy` that. CloudFormation updates the resources that changed.",
        "For Lambda, versions and aliases (with CodeDeploy traffic shifting) allow a fast switch back, if the app was built with them.",
        "Data written since the deployment, and any resource that was replaced, is not restored by redeploying. Restore from backups or point-in-time recovery if you have them.",
      ],
      commandsForYou: [],
    };
  }
  return {
    ...base,
    summary: `The stack is in ${status}, which this plugin has no advice for.`,
    options: ["Read the events with `status`."],
    commandsForYou: [],
  };
}
