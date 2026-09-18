---
name: Central provision request component
description: Existing Payload dashboard conventions for the central admission extension.
typography:
  field-help:
    fontSize: "0.9rem"
spacing:
  identity-gap: "0.25rem"
  field-gap: "0.5rem"
  action-gap: "0.75rem"
  row-gap: "1rem"
  form-gap: "1.25rem"
components:
  admission-field:
    padding: "0.65rem 0.8rem"
    width: "100%"
  inline-confirmation:
    padding: "1rem"
---

# Design System: Central provision request component

## Overview

This is a scoped record of the implemented **建站申请** extension inside the existing central Payload dashboard. Preserve the incumbent native Payload theme, typography, small buttons, and inline confirmations. It does not establish a new product identity or replace any project-wide design document.

Sources: [component](../../src/components/CentralProvisionRequests/index.tsx), [component styles](../../src/components/CentralProvisionRequests/style.scss), and the incumbent [site chooser styles](../../src/components/CentralSiteChooser/style.scss). Product and execution boundaries remain in the [execution plan](../site-per-d1-execution-plan.md) and [admission documentation](../site-per-d1-provision-admission.md).

The independent finish review returned **ship** with no material fixes in this bounded component scope; the supplied static detector result was empty. [Desktop](../site-per-d1-admission-desktop.jpg) and [mobile](../site-per-d1-admission-mobile.jpg) are cropped component regions from the full central Worker rendered in Cloudflare at viewport widths 1365 and 390. They demonstrate the open form and a cancelled request in the light theme. The review excludes the full dashboard, dark-theme rendering, comprehensive assistive-technology validation, and remote rollout. This record does not assert production deployment or completion of the execution plan.

## Colors

Reuse Payload's live CSS properties: `--theme-text` for text and focus outlines, `--theme-input-bg` for fields, `--theme-elevation-300` for field borders, `--theme-elevation-200` for form and confirmation borders, `--theme-elevation-150` for row dividers, and `--theme-elevation-50` for confirmation backgrounds. Retain these dependencies rather than freezing screenshot colors into a separate palette. Their resolved values and dark-theme appearance were not independently extracted here.

## Typography

Inherit Payload's font and heading hierarchy. Inputs and selects use `font: inherit`; labels remain visible above their controls, help text is subordinate, and request names use native strong text. On narrow screens, input/select text is at least 16px. No new font family, display scale, or status badge typography is introduced.

## Layout

The section has vertical margins of 2rem and explanatory paragraphs are limited to 70ch. Tenant selection precedes form actions and has a maximum width of 28rem. The form uses top and bottom dividers, vertical padding of 1rem, and two equal columns with the documented form gap. Below the form, requests use three columns: identity, actual state, and the available action.

At widths up to 600px, fields stack in one column; request identity spans the full row above state/actions. Long identities wrap anywhere. Action and pagination groups wrap with the documented action gap. This record applies to the component region, not the surrounding dashboard shell.

## Elevation & Depth

The extension adds no shadows or motion. Dividers separate the form and requests; the muted confirmation surface groups a pending cancellation inside its request row.

## Shapes

Inputs, selects, and confirmation panels inherit `--style-radius-s`. Fields have a 1px border and minimum height of 44px. Visible focus uses a 2px text-colored outline with a 2px offset. Disabled fields use opacity 0.7 and the `not-allowed` cursor. Payload owns the button shape and interaction styles.

## Components

- **Buttons:** use `@payloadcms/ui` `Button` with `size="small"`; secondary actions use `buttonStyle="secondary"`. Local styles only remove their outer margin. Do not replace native button visuals with a separately inferred primitive.
- **Human input:** explicitly select tenant and owner; enter website name, immutable site ID, and timezone. Tenant and owner choices come from the permitted scope. Changing tenant clears the owner and request pagination. With no permitted tenant, the successfully loaded section is absent.
- **Form and feedback:** opening the form focuses its heading. Labels bind to controls, relevant help uses `aria-describedby`, errors use alerts, and list updates use a polite live region. These are source-backed conventions, not a claim of comprehensive assistive-technology testing.
- **Request identity and state:** show name, site ID, UTC submission time, and the durable state text: `queued` → 等待执行; `provisioning` → 创建中; `cancelled` → 已取消; `completed` → 已建成. Submission acknowledges the returned state. The interface explicitly says automatic execution is not enabled.
- **Uncertain submission:** retain and lock the original input, including its request ID, and offer “重试这次申请”. Input/conflict responses permit correction; session and permission errors give the appropriate recovery message. Do not start a second request to disguise an uncertain first result.
- **Cancellation:** only queued requests offer the action. Confirmation stays in the row, receives focus, and explains that cancellation cannot proceed once creation begins. Keeping the request returns focus to its trigger; uncertain cancellation offers retry of the same request, while conflicts require refreshing its state.
- **Lists:** preserve explicit loading, empty, error, refresh, and pagination states. Request records remain inspectable after cancellation. A saved or queued request is not a completed website.

The [sidecar](.impeccable/design.json) contains the observed breakpoint and two scoped CSS examples. Native Payload buttons and navigation controls remain library dependencies; the examples do not substitute for the React component or its behavior.

## Do's and Don'ts

- **Do** preserve Payload theme variables, typography, small buttons, and inline confirmations.
- **Do** preserve real durable states and retry the same request when an outcome is uncertain.
- **Do** keep the automatic-execution limitation visible until the execution path is actually enabled.
- **Don't** add infrastructure credentials, Worker IDs, or D1 IDs to the human-input form.
- **Don't** introduce a modal, invented progress, or a completion claim based only on saving an application.
- **Don't** generalize this component review into approval of the whole dashboard, dark theme, accessibility coverage, or remote rollout.
