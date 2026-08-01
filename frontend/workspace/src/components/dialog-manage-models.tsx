import { Dialog } from "@synsci/ui/dialog"
import { List } from "@synsci/ui/list"
import { Switch } from "@synsci/ui/switch"
import type { Component } from "solid-js"
import { useLocal } from "@/context/local"
import { useLanguage } from "@/context/language"
import { displayProviderForModel } from "@/context/model-catalog"

export const DialogManageModels: Component = () => {
  const local = useLocal()
  const language = useLanguage()

  return (
    <Dialog title={language.t("dialog.model.manage")} description={language.t("dialog.model.manage.description")}>
      <List
        class="[&_[data-slot=list-item]]:!py-2"
        search={{ placeholder: language.t("dialog.model.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.model.empty")}
        key={(x) => `${x?.provider?.id}:${x?.id}`}
        items={local.model.list()}
        filterKeys={["name"]}
        sortBy={(a, b) => a.name.localeCompare(b.name)}
        onSelect={(x) => {
          if (!x) return
          const visible = local.model.visible({
            modelID: x.id,
            providerID: x.provider.id,
          })
          local.model.setVisibility({ modelID: x.id, providerID: x.provider.id }, !visible)
        }}
      >
        {(i) => (
          <div class="w-full flex items-center justify-between gap-x-3">
            <span class="min-w-0 flex flex-col truncate text-left">
              <span class="truncate text-13-medium text-text-strong">{i.name}</span>
              <span class="truncate text-11-regular text-text-weak">
                {displayProviderForModel(i.provider, i.id).name}
              </span>
            </span>
            <div onClick={(e) => e.stopPropagation()}>
              <Switch
                hideLabel
                checked={
                  !!local.model.visible({
                    modelID: i.id,
                    providerID: i.provider.id,
                  })
                }
                onChange={(checked) => {
                  local.model.setVisibility({ modelID: i.id, providerID: i.provider.id }, checked)
                }}
              >
                {`${local.model.visible({ modelID: i.id, providerID: i.provider.id }) ? "hide" : "show"} ${i.name}`}
              </Switch>
            </div>
          </div>
        )}
      </List>
    </Dialog>
  )
}
