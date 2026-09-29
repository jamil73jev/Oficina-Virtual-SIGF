"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Dialog, Input } from "@/components/ui";

export function NewProjectDialog() {
  const t = useTranslations("dialog");
  const tHome = useTranslations("home");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>{tHome("newProject")}</Button>
      <Dialog
        open={open}
        onClose={close}
        title={t("newProjectTitle")}
        description={t("newProjectDescription")}
        closeLabel={t("close")}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t("cancel")}
            </Button>
            <Button onClick={close}>{t("create")}</Button>
          </>
        }
      >
        <Input
          label={t("objective")}
          placeholder={t("objectivePlaceholder")}
          hint={t("objectiveHint")}
        />
      </Dialog>
    </>
  );
}
