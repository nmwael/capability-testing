# generate-opencode.jq — convert the shared stack.json manifest (written by the
# models feature) into an opencode.json.
#
# Emits the OpenCode V2 shape (opencode >= 2.0). The V1 keys ("provider",
# "agent", "permission", "enabled_providers", "small_model", "server",
# "subagent_depth", root "limit") are deliberately NOT emitted: OpenCode 2
# treats them as unsupported legacy settings, drops them, and logs
#   "configuration normalization diagnostic ... omitted unsupported legacy setting"
# so the setting silently has no effect. In particular the root "subagent_depth"
# is dropped — the live key is experimental.subagent_depth.
#
#   * cloud mode   (stack.json.cloud == true): every agent routes to the hosted
#     opencode provider ("opencode/<roles[].model>"); no local providers, no
#     per-slot ids, slots/latency/context come from the hosted model directly.
#   * local mode   (default): one provider per model backend (baseURL through the
#     bifrost gateway), per-slot model ids "{name}" + "-s0..-s{parallel-1}",
#     agent -> model-id pin map from stack.roles, and top-level model
#     = the "build" role's model id (keyed off the first role when "build" absent).
#
# Every agent entry also carries per-role sampling/budget defaults
# (request.body.temperature, steps). An explicit .temperature/.steps on the
# stack.roles entry overrides the per-role default.
#
# Provider restriction is expressed as top-level "policies" statements
# (provider.use deny-all + allow each configured provider). That key needs
# opencode >= 2.1; on 2.0.x the equivalent is experimental.policies.
def temp_default($role):
    { architect: 0.1, coder: 0.1, researcher: 0.1, reviewer: 0.1,
      build: 0.2, ui: 0.2, artist: 0.3 }[$role] // 0.1;
def steps_default($role):
    { architect: 500, coder: 25, researcher: 20, reviewer: 15,
      build: 40, ui: 20, artist: 15 }[$role] // 20;
def provider_policies($ids):
    ([ { action: "provider.use", resource: "*", effect: "deny" } ]
     + ($ids | map({ action: "provider.use", resource: ., effect: "allow" })));
def agent_entry($model_id; $temperature; $steps):
    { model: $model_id,
      request: { body: { temperature: $temperature } },
      steps: $steps };
(.cloud // false) as $is_cloud
| (.cloud_provider // "opencode") as $cprov
| .opencode_port as $op
| (.subagent_depth // 2) as $sd
| .roles as $roles
| ((if ($roles | has("build")) then $roles.build else ($roles | to_entries[0].value) end)) as $primary
| if $is_cloud then
    ((reduce ($roles | to_entries[]) as $e ({};
          . + { ($e.key): agent_entry(($cprov + "/" + $e.value.model);
                                     ($e.value.temperature // temp_default($e.key));
                                     ($e.value.steps // steps_default($e.key))) } ))) as $agent_map
    | {
        "$schema": "https://opencode.ai/config.json",
        model: ($cprov + "/" + $primary.model),
        providers: { ($cprov): { settings: { setCacheKey: false } } },
        agents: $agent_map,
        permissions: [ { action: "*", resource: "*", effect: "allow" } ],
        policies: provider_policies([$cprov]),
        experimental: { subagent_depth: $sd }
      }
  else
    .bifrost_port as $bp
    | .models as $models
    | (($primary.model) as $pn | (first($models[] | select(.name == $pn))).provider) as $primary_provider
    | ($primary_provider + "/" + $primary.model + "-s" + ($primary.slot | tostring)) as $primary_id
    | ((
          reduce $models[] as $m ({};
              . + {
                  ($m.provider): {
                      package: "aisdk:@ai-sdk/openai-compatible",
                      name: ("Bifrost (local " + $m.name + ")"),
                      settings: {
                          baseURL: ("http://127.0.0.1:" + ($bp | tostring) + "/v1")
                      },
                      headers: { "x-bf-passthrough-extra-params": "true" },
                      models:
                          ({ ($m.name): { name: ($m.name + " (unpinned fallback)"), limit: { context: $m.context, output: ($m.output // 8192) } } }
                           + (reduce range(0; $m.parallel) as $i ({};
                                 . + { (($m.name) + "-s" + ($i | tostring)):
                                       { name: ($m.name + " - Slot " + ($i | tostring)), limit: { context: $m.context, output: ($m.output // 8192) } } })))
                  }
              }
          )
      ) + { opencode: { settings: { setCacheKey: false } } }) as $providers
    | ((reduce $models[] as $m ([]; . + [$m.provider])) | unique | . + ["opencode"]) as $enabled
    | ((reduce ($roles | to_entries[]) as $e ({};
              . + { ($e.key): agent_entry(
                        ((first($models[] | select(.name == $e.value.model))).provider
                         + "/" + $e.value.model + "-s" + ($e.value.slot | tostring));
                        ($e.value.temperature // temp_default($e.key));
                        ($e.value.steps // steps_default($e.key))) } ))) as $agent_map
    | {
        "$schema": "https://opencode.ai/config.json",
        model: $primary_id,
        providers: $providers,
        agents: $agent_map,
        permissions: [ { action: "*", resource: "*", effect: "allow" } ],
        policies: provider_policies($enabled),
        experimental: { subagent_depth: $sd }
      }
  end
