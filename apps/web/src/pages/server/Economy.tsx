import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Coins, Landmark, Package, Pencil, Plus, Scale, ShoppingBag, Trash2, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { MetricCard, PageHeader, StatGrid } from "../../components/cards";
import { ConfigPage, SettingsSection } from "../../components/config/engine";
import { MemberPicker, RoleName, RolePicker, UserChip } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, CardHeader, Checkbox, Field, Tabs, TextArea, TextInput, Toggle, Unsupported } from "../../components/ui/primitives";
import { ConfirmDialog, Modal } from "../../components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/states";
import { DataTable, Pagination } from "../../components/ui/table";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { engagementApi, useEconomyOverview, useEconomyUser, useTransactions, type ItemInput } from "../../lib/api/engagement";
import { keys } from "../../lib/api/keys";
import type { EconomyItem } from "../../lib/api/types";
import { formatDate, formatNumber, timeAgo } from "../../lib/utils";
import { displayName, useResolvedUser } from "../../hooks/useUsers";
import { useGuild } from "../../hooks/useGuild";

function useCurrency() {
  const { values } = useGuild();
  const symbol = String(values["economy.currency_symbol"] ?? "🪙");
  const name = String(values["economy.currency_name"] ?? "coins");
  return { symbol, name, format: (amount: number) => `${symbol} ${formatNumber(amount)}` };
}

function Overview() {
  const { guildId } = useGuild();
  const overview = useEconomyOverview(guildId);
  const currency = useCurrency();
  const data = overview.data;
  if (overview.error) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  return (
    <div className="space-y-4">
      <StatGrid>
        <MetricCard label="In circulation" value={data ? data.wallet + data.bank : undefined} icon={Coins} tone="warning" loading={overview.isLoading} hint={data ? `${currency.format(data.wallet)} wallets · ${currency.format(data.bank)} banks` : undefined} />
        <MetricCard label="Active accounts" value={data?.accounts} icon={Users} loading={overview.isLoading} />
        <MetricCard label="Lifetime earned" value={data?.lifetime} icon={Landmark} loading={overview.isLoading} />
        <MetricCard label="Shop items" value={data?.items.length} icon={ShoppingBag} loading={overview.isLoading} />
      </StatGrid>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Richest members" description="Ranked by wallet balance." icon={<Wallet className="h-4 w-4" />} />
          {overview.isLoading ? (
            <SkeletonRows className="p-4" rows={5} />
          ) : !data || data.richest.length === 0 ? (
            <EmptyState compact title="No accounts yet" description="Accounts are created when members first use an economy command." />
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {data.richest.map((row, index) => (
                <li key={row.userId} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-6 font-mono text-xs text-zinc-500">{index + 1}</span>
                  <span className="flex-1">
                    <UserChip userId={row.userId} />
                  </span>
                  <span className="text-13 tabular-nums text-zinc-100">{currency.format(row.wallet)}</span>
                  <span className="hidden w-28 text-right text-xs tabular-nums text-zinc-500 sm:block">bank {formatNumber(row.bank)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent transactions" description="From the immutable ledger." icon={<ArrowLeftRight className="h-4 w-4" />} />
          {overview.isLoading ? (
            <SkeletonRows className="p-4" rows={5} />
          ) : !data || data.transactions.length === 0 ? (
            <EmptyState compact title="No transactions yet" />
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {data.transactions.slice(0, 10).map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                  <Badge>{tx.type}</Badge>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-zinc-400">
                    {tx.fromId ? <UserChip userId={tx.fromId} size={16} /> : <span className="text-zinc-600">system</span>}→{tx.toId ? <UserChip userId={tx.toId} size={16} /> : <span className="text-zinc-600">system</span>}
                  </span>
                  <span className="tabular-nums text-zinc-200">{currency.format(tx.amount)}</span>
                  <span className="hidden text-zinc-600 sm:inline">{timeAgo(tx.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function ItemModal({ item, open, onClose }: { item: EconomyItem | null; open: boolean; onClose: () => void }) {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const editing = Boolean(item);
  const [form, setForm] = useState<ItemInput>({});
  const value = <K extends keyof ItemInput>(key: K, fallback: NonNullable<ItemInput[K]> | null) => (key in form ? form[key] : item ? (item[key as keyof EconomyItem] as ItemInput[K]) : fallback);
  const set = (patch: ItemInput) => setForm((current) => ({ ...current, ...patch }));
  const close = () => {
    setForm({});
    onClose();
  };
  const save = useMutation({
    mutationFn: () => {
      if (item) return engagementApi.updateItem(guildId, item.id, form);
      return engagementApi.createItem(guildId, {
        name: String(value("name", "")),
        description: (value("description", "") as string) || null,
        category: String(value("category", "misc")),
        price: Number(value("price", 100)),
        stock: value("stock", null) as number | null,
        roleId: (value("roleId", null) as string | null) ?? null,
        consumable: Boolean(value("consumable", false)),
        enabled: Boolean(value("enabled", true)),
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Item updated" : "Item created");
      void queryClient.invalidateQueries({ queryKey: keys.economy(guildId) });
      close();
    },
    onError: (error) => toast.error(editing ? "Couldn't update the item" : "Couldn't create the item", errorMessage(error)),
  });
  const name = String(value("name", ""));
  const price = Number(value("price", 100));
  const stock = value("stock", null) as number | null;
  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? `Edit ${item?.name}` : "New shop item"}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim() || price < 0 || (editing && Object.keys(form).length === 0)} loading={save.isPending} onClick={() => save.mutate()}>
            {editing ? "Save item" : "Create item"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <TextInput value={name} maxLength={80} onChange={(event) => set({ name: event.target.value })} />
        </Field>
        <Field label="Description">
          <TextArea rows={2} maxLength={500} value={String(value("description", "") ?? "")} onChange={(event) => set({ description: event.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price" required>
            <TextInput type="number" min={0} value={price} onChange={(event) => set({ price: Number(event.target.value) })} />
          </Field>
          <Field label="Stock" hint="Empty = unlimited">
            <TextInput type="number" min={0} value={stock ?? ""} onChange={(event) => set({ stock: event.target.value === "" ? null : Number(event.target.value) })} />
          </Field>
          <Field label="Category">
            <TextInput value={String(value("category", "misc"))} maxLength={40} disabled={editing} onChange={(event) => set({ category: event.target.value })} />
          </Field>
        </div>
        <Field label="Role reward" hint={editing ? "The role can't be changed after creation (API limitation)." : "Granted when the item is bought."}>
          {editing ? <div className="input flex items-center">{item?.roleId ? <RoleName id={item.roleId} /> : <span className="text-zinc-600">None</span>}</div> : <RolePicker value={(value("roleId", null) as string | null) ?? null} onChange={(roleId) => set({ roleId })} />}
        </Field>
        <div className="flex flex-wrap gap-6">
          <Checkbox checked={Boolean(value("consumable", false))} onChange={(consumable) => set({ consumable })} label="Consumable" description="Removed from inventory when used" />
          <Checkbox checked={Boolean(value("enabled", true))} onChange={(enabled) => set({ enabled })} label="Available in shop" />
        </div>
      </div>
    </Modal>
  );
}

function Shop() {
  const { guildId, canConfigure } = useGuild();
  const overview = useEconomyOverview(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const currency = useCurrency();
  const [editing, setEditing] = useState<EconomyItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [remove, setRemove] = useState<EconomyItem | null>(null);
  const toggle = useMutation({
    mutationFn: (item: EconomyItem) => engagementApi.updateItem(guildId, item.id, { enabled: !item.enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.economy(guildId) }),
    onError: (error) => toast.error("Couldn't update the item", errorMessage(error)),
  });
  const del = useMutation({
    mutationFn: (id: string) => engagementApi.deleteItem(guildId, id),
    onSuccess: () => {
      toast.success("Item deleted");
      setRemove(null);
      void queryClient.invalidateQueries({ queryKey: keys.economy(guildId) });
    },
    onError: (error) => toast.error("Couldn't delete the item", errorMessage(error)),
  });
  return (
    <Card>
      <CardHeader title="Shop manager" description="Items members can buy with the bot's shop commands." icon={<ShoppingBag className="h-4 w-4" />} action={canConfigure ? <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>New item</Button> : null} />
      <DataTable<EconomyItem>
        loading={overview.isLoading}
        rows={overview.data?.items}
        rowKey={(row) => row.id}
        empty={<EmptyState compact icon={Package} title="The shop is empty" description="Create items with prices, stock and role rewards." />}
        columns={[
          { id: "name", header: "Item", cell: (row) => (<span><span className="block text-zinc-100">{row.name}</span>{row.description ? <span className="block max-w-[260px] truncate text-xs text-zinc-500">{row.description}</span> : null}</span>) },
          { id: "category", header: "Category", cell: (row) => <Badge>{row.category}</Badge> },
          { id: "price", header: "Price", cell: (row) => <span className="tabular-nums">{currency.format(row.price)}</span> },
          { id: "stock", header: "Stock", cell: (row) => (row.stock === null ? <span className="text-zinc-500">∞</span> : formatNumber(row.stock)) },
          { id: "type", header: "Type", cell: (row) => <span className="text-xs text-zinc-400">{row.consumable ? "Consumable" : "Permanent"}{row.roleId ? " · role" : ""}</span> },
          { id: "role", header: "Role reward", cell: (row) => (row.roleId ? <RoleName id={row.roleId} /> : <span className="text-zinc-600">—</span>) },
          { id: "enabled", header: "Status", cell: (row) => <Toggle size="sm" label={`${row.name} available`} checked={row.enabled} disabled={!canConfigure} loading={toggle.isPending && toggle.variables?.id === row.id} onChange={() => toggle.mutate(row)} /> },
          {
            id: "actions",
            header: "",
            className: "w-20",
            cell: (row) =>
              canConfigure ? (
                <div className="flex justify-end gap-1">
                  <button type="button" aria-label={`Edit ${row.name}`} onClick={() => setEditing(row)} className="btn-icon h-7 w-7">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label={`Delete ${row.name}`} onClick={() => setRemove(row)} className="btn-icon h-7 w-7 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null,
          },
        ]}
      />
      <ItemModal key={editing?.id ?? (creating ? "new" : "closed")} item={editing} open={creating || Boolean(editing)} onClose={() => { setCreating(false); setEditing(null); }} />
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove.id)} loading={del.isPending} title={`Delete ${remove?.name}?`} description="Members who own it keep it in their inventory history, but it can no longer be bought." confirmLabel="Delete item" />
    </Card>
  );
}

function Transactions() {
  const { guildId, canModerate } = useGuild();
  const [page, setPage] = useState(1);
  const tx = useTransactions(guildId, page);
  const currency = useCurrency();
  if (!canModerate) return <Card><EmptyState title="Moderator access required" description="The full transaction ledger is visible to staff." /></Card>;
  return (
    <Card>
      <CardHeader title="Transaction ledger" description="Every balance change, newest first. Records can't be edited." icon={<ArrowLeftRight className="h-4 w-4" />} />
      {tx.error ? (
        <ErrorState error={tx.error} compact onRetry={() => void tx.refetch()} />
      ) : (
        <DataTable
          loading={tx.isFetching}
          rows={tx.data?.transactions}
          rowKey={(row) => row.id}
          empty={<EmptyState compact title="No transactions yet" />}
          columns={[
            { id: "id", header: "ID", className: "font-mono text-2xs text-zinc-500", cell: (row) => row.id.slice(-10) },
            { id: "from", header: "From", cell: (row) => (row.fromId ? <UserChip userId={row.fromId} /> : <span className="text-zinc-600">System</span>) },
            { id: "to", header: "To", cell: (row) => (row.toId ? <UserChip userId={row.toId} /> : <span className="text-zinc-600">System</span>) },
            { id: "amount", header: "Amount", cell: (row) => <span className="tabular-nums text-zinc-100">{currency.format(row.amount)}</span> },
            { id: "type", header: "Type", cell: (row) => <Badge tone={row.type.startsWith("admin") ? "warning" : "neutral"}>{row.type}</Badge> },
            { id: "time", header: "Time", cell: (row) => <span className="text-zinc-500" title={formatDate(row.createdAt)}>{timeAgo(row.createdAt)}</span> },
          ]}
        />
      )}
      {tx.data ? <Pagination page={page} pageSize={tx.data.pageSize} total={tx.data.total} onChange={setPage} /> : null}
    </Card>
  );
}

function MemberAccounts() {
  const { guildId, canConfigure, canModerate } = useGuild();
  const [userId, setUserId] = useState<string | null>(null);
  const account = useEconomyUser(guildId, canModerate ? userId : null);
  const user = useResolvedUser(guildId, userId);
  const currency = useCurrency();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const delta = Math.trunc(Number(amount));
  const adjust = useMutation({
    mutationFn: () => engagementApi.adjustBalance(guildId, userId!, delta, reason.trim()),
    onSuccess: () => {
      toast.success("Balance adjusted", `${delta > 0 ? "Credited" : "Debited"} ${currency.format(Math.abs(delta))} — recorded in the ledger and audit log.`);
      setConfirm(false);
      setAmount("");
      setReason("");
      void queryClient.invalidateQueries({ queryKey: keys.economy(guildId) });
    },
    onError: (error) => {
      setConfirm(false);
      toast.error("Adjustment failed", errorMessage(error));
    },
  });
  if (!canModerate) return <Card><EmptyState title="Moderator access required" /></Card>;
  return (
    <Card>
      <CardHeader title="Member accounts" description="Look up a member's wallet, bank and inventory." icon={<Wallet className="h-4 w-4" />} />
      <div className="space-y-4 p-5">
        <MemberPicker value={userId} onChange={(id) => setUserId(id)} />
        {userId ? (
          account.isLoading ? (
            <SkeletonRows rows={2} />
          ) : account.error ? (
            <ErrorState error={account.error} compact />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <MetricCard compact label="Wallet" value={account.data?.account?.wallet ?? null} unavailable="No account" />
                <MetricCard compact label="Bank" value={account.data?.account?.bank ?? null} unavailable="No account" />
                <MetricCard compact label="Lifetime" value={account.data?.account?.lifetime ?? null} unavailable="No account" />
              </div>
              <div>
                <p className="eyebrow mb-2">Inventory</p>
                {(account.data?.inventory ?? []).length === 0 ? (
                  <p className="text-xs text-zinc-500">No items owned.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {(account.data?.inventory ?? []).map((entry, index) => (
                      <li key={index} className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-zinc-300">
                        {(entry.item as EconomyItem | undefined)?.name ?? String(entry.itemId ?? "item")} × {String(entry.quantity ?? 1)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {canConfigure ? (
                <div className="space-y-3 rounded-lg border border-ink-700 p-4">
                  <p className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                    <Scale className="h-3.5 w-3.5" /> Audited balance adjustment
                  </p>
                  <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                    <Field label="Amount" hint="Negative to debit">
                      <TextInput type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="+500 or -200" />
                    </Field>
                    <Field label="Reason" required>
                      <TextInput value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="Event prize, refund, correction…" />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="primary" disabled={!delta || !reason.trim()} onClick={() => setConfirm(true)}>
                      Review adjustment
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )
        ) : (
          <p className="text-xs text-zinc-500">Search for a member to see their account.</p>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => adjust.mutate()}
        loading={adjust.isPending}
        tone="primary"
        title={`${delta > 0 ? "Credit" : "Debit"} ${currency.format(Math.abs(delta || 0))} ${delta > 0 ? "to" : "from"} ${displayName(user.data, userId)}?`}
        description={`A ${delta > 0 ? "admin_credit" : "admin_debit"} ledger entry is written with your account as the actor. Reason: “${reason.trim()}”.`}
        confirmLabel="Apply adjustment"
      />
    </Card>
  );
}

export function EconomyPage() {
  const { modules } = useGuild();
  const [tab, setTab] = useState<"overview" | "shop" | "transactions" | "accounts" | "settings">("overview");
  const enabled = modules.find((module) => module.id === "economy")?.enabled;
  return (
    <ConfigPage>
      <PageHeader title="Economy" icon={Coins} description="A per-server virtual currency with an immutable ledger. All gambling mechanics use virtual currency only." />
      {enabled === false ? <Callout tone="warning" className="mb-4">The economy module is disabled. Members can't use economy commands until it's enabled.</Callout> : null}
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "shop", label: "Shop" }, { id: "transactions", label: "Transactions" }, { id: "accounts", label: "Accounts" }, { id: "settings", label: "Settings" }]} />
      {tab === "overview" ? <Overview /> : null}
      {tab === "shop" ? <Shop /> : null}
      {tab === "transactions" ? <Transactions /> : null}
      {tab === "accounts" ? <MemberAccounts /> : null}
      {tab === "settings" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SettingsSection id="economy-currency" title="Currency & rewards" icon={<Coins className="h-4 w-4" />} configKeys={["economy.enabled", "economy.currency_name", "economy.currency_symbol", "economy.starting_balance", "economy.daily_reward", "economy.weekly_reward", "economy.work_cooldown", "economy.transfer_limit"]} />
          <div className="space-y-4">
            <SettingsSection id="economy-features" title="Features" icon={<ShoppingBag className="h-4 w-4" />} configKeys={["economy.bank_enabled", "economy.shop_enabled", "economy.trading_enabled", "economy.gambling_enabled"]} overrides={{ "economy.gambling_enabled": { label: "Virtual gambling games", description: "Coinflip, slots, blackjack and similar games — virtual currency only, never real money." } }} />
            <Unsupported title="Businesses and trades">Business ownership and trade history exist in the bot but have no dashboard endpoints yet.</Unsupported>
          </div>
        </div>
      ) : null}
    </ConfigPage>
  );
}
