import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileClock,
  FileText,
  FileUp,
  FilterX,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { api, ApiError, fileUrl } from '../lib/api';
import type { Paged } from '../lib/api';
import { useAsync, useDebounced, usePaged } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatDate, formatNumber } from '../lib/format';
import { DOCUMENT_CATEGORY_LABELS, label } from '../lib/constants';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dropdown,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatCard,
  TableSkeleton,
  Textarea,
  useToast,
} from '../components/ui';
import { FilterBar, MetaChip, NoticeBanner, StatusBadge } from '../components/common';

/* ------------------------------------------------------------------ types */

interface DocRow {
  id: number;
  name: string;
  description: string | null;
  category: string;
  related_type: string | null;
  related_id: number | null;
  uploaded_by: number | null;
  upload_date: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  checksum: string;
  status: string;
  version: number;
  supersedes_id: number | null;
  created_at: string;
  uploaded_by_name: string | null;
  related_code: string | null;
  related_title: string | null;
}

interface DocumentsMeta {
  categories: string[];
  statuses: string[];
  relatedTypes: string[];
  maxFileSizeBytes: number;
  allowedExtensions: string[];
}

interface VersionRow {
  id: number;
  name: string;
  version: number;
  upload_date: string;
  file_size: number;
  file_type: string;
  uploaded_by_name: string | null;
}

/* --------------------------------------------------------------- helpers */

const RELATED_TYPE_LABELS: Record<string, string> = {
  PROJECT: 'Research project',
  IPR: 'IPR record',
  STARTUP: 'Startup',
  APPROVAL: 'Approval request',
  FUNDING: 'Funding opportunity',
};

const MENU_LINK =
  'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink-700 transition hover:bg-ink-50';

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function categoryLabel(category: string): string {
  return DOCUMENT_CATEGORY_LABELS[category] ?? category ?? '—';
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/** Turns an API failure into a readable message (including field details). */
function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.details && err.details.length > 0) {
      return `${err.message}: ${err.details.map((d) => `${d.field} — ${d.message}`).join('; ')}`;
    }
    return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/* ------------------------------------------------------- upload documents */

function UploadDocumentsModal({
  open,
  onClose,
  meta,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  meta: DocumentsMeta | null;
  onUploaded: () => void;
}) {
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [description, setDescription] = useState('');
  const [relatedType, setRelatedType] = useState('');
  const [relatedId, setRelatedId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [fileError, setFileError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allowed = meta?.allowedExtensions ?? [];
  const maxSize = meta?.maxFileSizeBytes ?? 10 * 1024 * 1024;

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setName('');
    setCategory(meta?.categories?.[0] ?? 'OTHER');
    setDescription('');
    setRelatedType('');
    setRelatedId('');
    setStatus('ACTIVE');
    setFileError(null);
    setFieldError(null);
    setServerError(null);
  }, [open, meta]);

  const pickFiles = (selected: FileList | null) => {
    setFileError(null);
    if (!selected || selected.length === 0) {
      setFiles([]);
      return;
    }
    const list = Array.from(selected);
    if (list.length > 10) {
      setFileError('You can upload at most 10 files at a time.');
      setFiles([]);
      return;
    }
    const problems: string[] = [];
    for (const file of list) {
      const extension = extensionOf(file.name);
      if (allowed.length > 0 && !allowed.includes(extension)) {
        problems.push(`"${file.name}" has an unsupported type (${extension || 'unknown'}).`);
      }
      if (file.size > maxSize) {
        problems.push(`"${file.name}" is ${formatBytes(file.size)} — the limit is ${formatBytes(maxSize)}.`);
      }
    }
    if (problems.length > 0) {
      setFileError(problems.join(' '));
      setFiles([]);
      return;
    }
    setFiles(list);
    setName((prev) => (prev.trim() ? prev : list[0].name));
  };

  const submit = async () => {
    if (files.length === 0) {
      setFileError('Select at least one file to upload.');
      return;
    }
    if (name.trim().length < 3) {
      setFieldError('Document name must be at least 3 characters.');
      return;
    }
    if (relatedType && relatedId.trim() !== '') {
      const numeric = Number(relatedId);
      if (!Number.isInteger(numeric) || numeric <= 0) {
        setFieldError('The linked record id must be a positive whole number.');
        return;
      }
    }
    setFieldError(null);
    setSubmitting(true);
    setServerError(null);
    try {
      const payload = new FormData();
      payload.append('name', name.trim());
      payload.append('category', category);
      payload.append('description', description.trim());
      if (relatedType) payload.append('relatedType', relatedType);
      if (relatedId.trim()) payload.append('relatedId', String(Number(relatedId)));
      payload.append('status', status);
      files.forEach((file) => payload.append('files', file));

      const res = await api.post<{ documents: { id: number; name: string; size: number }[]; message: string }>(
        '/documents',
        payload,
      );
      toast.success(
        `${res.documents.length} document${res.documents.length === 1 ? '' : 's'} uploaded`,
        res.message,
      );
      onUploaded();
      onClose();
    } catch (err) {
      const message = errorText(err, 'The documents could not be uploaded.');
      setServerError(message);
      toast.error('Upload failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload documents"
      description="Files are stored on the server and linked to the selected record."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={submit} icon={<Upload className="h-4 w-4" />}>
            Upload {files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'documents'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {serverError}
          </div>
        ) : null}

        <div>
          <label className="label-base" htmlFor="doc-files">
            Files <span className="text-rose-500">*</span>
          </label>
          <input
            id="doc-files"
            type="file"
            multiple
            accept={allowed.join(',')}
            onChange={(e) => pickFiles(e.target.files)}
            className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
          />
          <p className="mt-1 text-xs text-ink-500">
            Accepted: {allowed.join(', ') || '—'} · Maximum size {formatBytes(maxSize)} per file · Up to 10 files.
          </p>
          {fileError ? (
            <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
              {fileError}
            </p>
          ) : null}
          {files.length > 0 ? (
            <ul className="mt-2 space-y-1 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
              {files.map((f) => (
                <li key={f.name} className="flex items-center justify-between gap-3 text-xs text-ink-700">
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-ink-500">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Input
          label="Document name"
          required
          value={name}
          error={fieldError && fieldError.includes('name') ? fieldError : null}
          hint="Defaults to the name of the first selected file."
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Category"
            required
            value={category}
            options={(meta?.categories ?? Object.keys(DOCUMENT_CATEGORY_LABELS)).map((c) => ({
              value: c,
              label: categoryLabel(c),
            }))}
            onChange={(e) => setCategory(e.target.value)}
          />
          <Select
            label="Status"
            value={status}
            options={(meta?.statuses ?? ['ACTIVE', 'ARCHIVED', 'UNDER_REVIEW', 'REJECTED']).map((s) => ({
              value: s,
              label: label(s),
            }))}
            onChange={(e) => setStatus(e.target.value)}
          />
        </div>

        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Link to a record"
            value={relatedType}
            placeholder="Not linked"
            options={(meta?.relatedTypes ?? Object.keys(RELATED_TYPE_LABELS)).map((t) => ({
              value: t,
              label: RELATED_TYPE_LABELS[t] ?? t,
            }))}
            onChange={(e) => setRelatedType(e.target.value)}
          />
          <Input
            label="Linked record id"
            type="number"
            min={1}
            value={relatedId}
            error={fieldError && fieldError.includes('id') ? fieldError : null}
            hint="Numeric id of the linked record."
            onChange={(e) => setRelatedId(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- version history */

function VersionHistoryModal({
  doc,
  onClose,
}: {
  doc: DocRow;
  onClose: () => void;
}) {
  const query = useAsync<{ versions: VersionRow[]; currentId: number }>(
    () => api.get(`/documents/${doc.id}/versions`),
    [doc.id],
  );

  return (
    <Modal open onClose={onClose} title="Version history" description={doc.name} size="md">
      {query.loading && !query.data ? (
        <TableSkeleton rows={3} cols={3} />
      ) : query.error ? (
        <ErrorState message={query.error} onRetry={query.reload} />
      ) : (query.data?.versions ?? []).length === 0 ? (
        <EmptyState title="No versions found" description="This document has no stored versions." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {(query.data?.versions ?? []).map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
                  Version {v.version}
                  {v.id === query.data?.currentId ? <Badge tone="success">Current</Badge> : null}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {v.file_type} · {formatBytes(v.file_size)} · {formatDate(v.upload_date)} ·{' '}
                  {v.uploaded_by_name ?? 'Unknown'}
                </p>
              </div>
              <a
                href={fileUrl(v.id, true)}
                download
                className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------- upload a version */

function NewVersionModal({
  doc,
  meta,
  onClose,
  onSaved,
}: {
  doc: DocRow;
  meta: DocumentsMeta | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allowed = meta?.allowedExtensions ?? [];
  const maxSize = meta?.maxFileSizeBytes ?? 10 * 1024 * 1024;

  const pick = (selected: File | null) => {
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const extension = extensionOf(selected.name);
    if (allowed.length > 0 && !allowed.includes(extension)) {
      setFileError(`File type "${extension || 'unknown'}" is not allowed. Accepted: ${allowed.join(', ')}.`);
      setFile(null);
      return;
    }
    if (selected.size > maxSize) {
      setFileError(`This file is ${formatBytes(selected.size)}. The maximum allowed size is ${formatBytes(maxSize)}.`);
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const submit = async () => {
    if (!file) {
      setFileError('Select the new file for this version.');
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const res = await api.post<{ id: number; version: number; message: string }>(
        `/documents/${doc.id}/versions`,
        payload,
      );
      toast.success('New version uploaded', res.message);
      onSaved();
      onClose();
    } catch (err) {
      const message = errorText(err, 'The version could not be uploaded.');
      setServerError(message);
      toast.error('Upload failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload a new version"
      description={`A new version of “${doc.name}” is stored and the previous one is kept.`}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={submit} icon={<FileUp className="h-4 w-4" />}>
            Upload version
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {serverError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {serverError}
          </div>
        ) : null}
        <div>
          <label className="label-base" htmlFor="version-file">
            Replacement file <span className="text-rose-500">*</span>
          </label>
          <input
            id="version-file"
            type="file"
            accept={allowed.join(',')}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
          />
          <p className="mt-1 text-xs text-ink-500">
            Accepted: {allowed.join(', ') || '—'} · Maximum size {formatBytes(maxSize)}.
          </p>
          {fileError ? (
            <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
              {fileError}
            </p>
          ) : null}
          {file ? (
            <p className="mt-1 text-xs text-ink-600">
              Selected: <span className="font-medium text-ink-800">{file.name}</span> · {formatBytes(file.size)}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- edit modal */

function EditDocumentModal({
  doc,
  meta,
  onClose,
  onSaved,
}: {
  doc: DocRow;
  meta: DocumentsMeta | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(doc.name);
  const [description, setDescription] = useState(doc.description ?? '');
  const [category, setCategory] = useState(doc.category);
  const [status, setStatus] = useState(doc.status);
  const [relatedType, setRelatedType] = useState(doc.related_type ?? '');
  const [relatedId, setRelatedId] = useState(doc.related_id ? String(doc.related_id) : '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (name.trim().length < 3) {
      setNameError('Document name must be at least 3 characters.');
      return;
    }
    setNameError(null);
    setSubmitting(true);
    setServerError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        category,
        status,
      };
      if (relatedType) body.relatedType = relatedType;
      if (relatedId.trim()) body.relatedId = Number(relatedId);

      await api.patch(`/documents/${doc.id}`, body);
      toast.success('Document updated', `${name.trim()} was saved.`);
      onSaved();
      onClose();
    } catch (err) {
      const message = errorText(err, 'The document could not be updated.');
      setServerError(message);
      toast.error('Could not update the document', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit document details"
      description="Only the metadata of the stored file is changed."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={submit}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {serverError}
          </div>
        ) : null}
        <Input
          label="Document name"
          required
          value={name}
          error={nameError}
          onChange={(e) => setName(e.target.value)}
        />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Category"
            value={category}
            options={(meta?.categories ?? Object.keys(DOCUMENT_CATEGORY_LABELS)).map((c) => ({
              value: c,
              label: categoryLabel(c),
            }))}
            onChange={(e) => setCategory(e.target.value)}
          />
          <Select
            label="Status"
            value={status}
            options={(meta?.statuses ?? ['ACTIVE', 'ARCHIVED', 'UNDER_REVIEW', 'REJECTED']).map((s) => ({
              value: s,
              label: label(s),
            }))}
            onChange={(e) => setStatus(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Link to a record"
            value={relatedType}
            placeholder="Not linked"
            options={(meta?.relatedTypes ?? Object.keys(RELATED_TYPE_LABELS)).map((t) => ({
              value: t,
              label: RELATED_TYPE_LABELS[t] ?? t,
            }))}
            onChange={(e) => setRelatedType(e.target.value)}
          />
          <Input
            label="Linked record id"
            type="number"
            min={1}
            value={relatedId}
            hint="Leave empty to keep the current link."
            onChange={(e) => setRelatedId(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ page */

export default function Documents() {
  const { user, can } = useAuth();
  const toast = useToast();

  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [relatedType, setRelatedType] = useState('');
  const [status, setStatus] = useState('');
  const [uploadedBy, setUploadedBy] = useState('');
  const search = useDebounced(searchInput, 350);

  const params = useMemo(
    () => ({ search, category, relatedType, status, uploadedBy }),
    [search, category, relatedType, status, uploadedBy],
  );

  const list = usePaged<DocRow>('/documents', params, 10);
  const meta = useAsync<DocumentsMeta>(() => api.get<DocumentsMeta>('/documents/meta'), []);

  // Uploader options are taken from the real uploaded documents (the users
  // endpoint is restricted to administrators).
  const uploaderSource = useAsync<Paged<DocRow>>(
    () => api.get<Paged<DocRow>>('/documents', { pageSize: 100 }),
    [],
  );

  const uploaders = useMemo(() => {
    const map = new Map<number, string>();
    for (const doc of uploaderSource.data?.data ?? []) {
      if (doc.uploaded_by === null || doc.uploaded_by === undefined) continue;
      map.set(doc.uploaded_by, doc.uploaded_by_name ?? `User #${doc.uploaded_by}`);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ value: String(id), label: name }));
  }, [uploaderSource.data]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [versionDoc, setVersionDoc] = useState<DocRow | null>(null);
  const [versionUploadDoc, setVersionUploadDoc] = useState<DocRow | null>(null);
  const [editDoc, setEditDoc] = useState<DocRow | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const rows = list.data?.data ?? [];

  const categoryBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of rows) counts.set(doc.category, (counts.get(doc.category) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, label: categoryLabel(key), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [rows]);

  const latestUpload = useMemo(
    () =>
      rows.reduce<string | null>((latest, doc) => {
        if (!latest) return doc.upload_date;
        return new Date(doc.upload_date).getTime() > new Date(latest).getTime() ? doc.upload_date : latest;
      }, null),
    [rows],
  );

  const canUpload = can('document.upload');
  const canDeleteAny = can('document.delete.any');
  const canDeleteOwn = can('document.delete.own');
  const userId = user?.id ?? -1;

  const resetFilters = () => {
    setSearchInput('');
    setCategory('');
    setRelatedType('');
    setStatus('');
    setUploadedBy('');
    list.setPage(1);
  };

  const changeFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    list.setPage(1);
  };

  const reloadAll = () => {
    list.reload();
    uploaderSource.reload();
  };

  const confirmDelete = async () => {
    if (!deleteDoc) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/documents/${deleteDoc.id}`);
      toast.success('Document deleted', `${deleteDoc.name} was removed.`);
      setDeleteDoc(null);
      reloadAll();
    } catch (err) {
      const message = errorText(err, 'The document could not be deleted.');
      toast.error('Could not delete the document', message);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Every file stored against a project, IPR record, startup, approval request or funding opportunity. Files are uploaded to the server and downloaded from the original stored file."
        actions={
          canUpload ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setUploadOpen(true)}>
              Upload documents
            </Button>
          ) : undefined
        }
      />

      <NoticeBanner tone="info" title="Stored files">
        <p>
          Uploads are stored on the server with their real metadata. The download and preview links below point at the
          stored file itself.
        </p>
      </NoticeBanner>

      {/* ---------------------------------------------------------- summary */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total documents"
          value={formatNumber(list.total)}
          icon={<FileText className="h-5 w-5" />}
          hint="Documents matching the current filters"
          tone="brand"
        />
        <StatCard
          title="On this page"
          value={formatNumber(rows.length)}
          icon={<FileClock className="h-5 w-5" />}
          hint="Rows currently displayed in the table"
          tone="ink"
        />
        <StatCard
          title="Categories on this page"
          value={formatNumber(categoryBreakdown.length)}
          icon={<FileText className="h-5 w-5" />}
          hint="Distinct categories among the rows shown"
          tone="violet"
        />
        <StatCard
          title="Latest upload"
          value={latestUpload ? formatDate(latestUpload) : '—'}
          icon={<Upload className="h-5 w-5" />}
          hint="Most recent upload date on this page"
          tone="emerald"
        />
      </div>

      {categoryBreakdown.length > 0 ? (
        <Card>
          <CardHeader
            title="On this page by category"
            description="Counts are derived from the rows currently displayed, not from the whole repository."
          />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {categoryBreakdown.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 text-xs"
                >
                  <span className="font-medium text-ink-700">{c.label}</span>
                  <span className="rounded-md bg-white px-1.5 py-0.5 font-semibold text-ink-900">{c.count}</span>
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------ table */}
      <Card>
        <FilterBar>
          <div className="relative min-w-[15rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search document name…"
              aria-label="Search documents"
              className="input-base pl-9"
            />
          </div>
          <Select
            aria-label="Category"
            className="h-9 py-0 text-xs sm:w-48"
            value={category}
            placeholder="All categories"
            options={(meta.data?.categories ?? []).map((c) => ({ value: c, label: categoryLabel(c) }))}
            onChange={(e) => changeFilter(setCategory)(e.target.value)}
          />
          <Select
            aria-label="Linked record type"
            className="h-9 py-0 text-xs sm:w-44"
            value={relatedType}
            placeholder="All record types"
            options={(meta.data?.relatedTypes ?? []).map((t) => ({
              value: t,
              label: RELATED_TYPE_LABELS[t] ?? t,
            }))}
            onChange={(e) => changeFilter(setRelatedType)(e.target.value)}
          />
          <Select
            aria-label="Status"
            className="h-9 py-0 text-xs sm:w-40"
            value={status}
            placeholder="All statuses"
            options={(meta.data?.statuses ?? []).map((s) => ({ value: s, label: label(s) }))}
            onChange={(e) => changeFilter(setStatus)(e.target.value)}
          />
          <Select
            aria-label="Uploaded by"
            className="h-9 py-0 text-xs sm:w-48"
            value={uploadedBy}
            placeholder="Anyone"
            options={uploaders}
            onChange={(e) => changeFilter(setUploadedBy)(e.target.value)}
          />
          <Button variant="ghost" size="sm" icon={<FilterX className="h-4 w-4" />} onClick={resetFilters}>
            Clear filters
          </Button>
        </FilterBar>

        {list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <TableSkeleton rows={8} cols={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No documents found"
            description="Upload a file or adjust the filters to see stored documents."
            icon={<FileText className="h-6 w-6" />}
            action={
              canUpload ? (
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => setUploadOpen(true)}>
                  Upload documents
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Document</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Linked record</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Size</th>
                    <th className="px-4 py-2.5">Version</th>
                    <th className="px-4 py-2.5">Uploaded by</th>
                    <th className="px-4 py-2.5">Upload date</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((doc) => {
                    const mayDelete = canDeleteAny || (canDeleteOwn && doc.uploaded_by === userId);
                    return (
                      <tr key={doc.id} className="transition hover:bg-ink-50">
                        <td className="table-cell">
                          <span className="font-medium text-ink-900">{doc.name}</span>
                          {doc.description ? (
                            <p className="max-w-[18rem] truncate text-xs text-ink-500">{doc.description}</p>
                          ) : null}
                        </td>
                        <td className="table-cell">{categoryLabel(doc.category)}</td>
                        <td className="table-cell">
                          {doc.related_code ? (
                            <>
                              <span className="font-medium text-ink-800">{doc.related_code}</span>
                              <p className="max-w-[14rem] truncate text-xs text-ink-500">{doc.related_title ?? '—'}</p>
                            </>
                          ) : doc.related_type ? (
                            <MetaChip>{RELATED_TYPE_LABELS[doc.related_type] ?? doc.related_type}</MetaChip>
                          ) : (
                            <span className="text-xs text-ink-400">Not linked</span>
                          )}
                        </td>
                        <td className="table-cell">{doc.file_type || '—'}</td>
                        <td className="table-cell">{formatBytes(doc.file_size)}</td>
                        <td className="table-cell">v{doc.version ?? 1}</td>
                        <td className="table-cell">{doc.uploaded_by_name ?? '—'}</td>
                        <td className="table-cell">{formatDate(doc.upload_date)}</td>
                        <td className="table-cell">
                          <StatusBadge status={doc.status} />
                        </td>
                        <td className="table-cell text-right">
                          <Dropdown
                            align="right"
                            trigger={
                              <Button variant="outline" size="sm" className="min-w-[4.5rem] justify-center">
                                Actions
                              </Button>
                            }
                          >
                            {(close) => (
                              <>
                                <DropdownLabel>File</DropdownLabel>
                                <a
                                  href={fileUrl(doc.id, true)}
                                  download
                                  className={MENU_LINK}
                                  onClick={() => close()}
                                >
                                  <Download className="h-4 w-4 text-ink-400" /> Download
                                </a>
                                <a
                                  href={fileUrl(doc.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={MENU_LINK}
                                  onClick={() => close()}
                                >
                                  <ExternalLink className="h-4 w-4 text-ink-400" /> View inline
                                </a>
                                <DropdownDivider />
                                <DropdownItem
                                  icon={<History className="h-4 w-4" />}
                                  onClick={() => {
                                    close();
                                    setVersionDoc(doc);
                                  }}
                                >
                                  Version history
                                </DropdownItem>
                                {canUpload ? (
                                  <DropdownItem
                                    icon={<FileUp className="h-4 w-4" />}
                                    onClick={() => {
                                      close();
                                      setVersionUploadDoc(doc);
                                    }}
                                  >
                                    Upload new version
                                  </DropdownItem>
                                ) : null}
                                <DropdownDivider />
                                <DropdownItem
                                  icon={<Pencil className="h-4 w-4" />}
                                  disabled={!mayDelete}
                                  onClick={() => {
                                    close();
                                    setEditDoc(doc);
                                  }}
                                >
                                  Edit metadata
                                </DropdownItem>
                                <DropdownItem
                                  icon={<Trash2 className="h-4 w-4" />}
                                  danger
                                  disabled={!mayDelete}
                                  onClick={() => {
                                    close();
                                    setDeleteDoc(doc);
                                  }}
                                >
                                  Delete
                                </DropdownItem>
                              </>
                            )}
                          </Dropdown>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={list.page}
              pageSize={list.pageSize}
              total={list.total}
              totalPages={list.totalPages}
              onPageChange={list.setPage}
              onPageSizeChange={list.setPageSize}
              itemLabel="documents"
            />
          </>
        )}
      </Card>

      {/* ------------------------------------------------------------ modals */}
      <UploadDocumentsModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        meta={meta.data}
        onUploaded={reloadAll}
      />

      {versionDoc ? (
        <VersionHistoryModal doc={versionDoc} onClose={() => setVersionDoc(null)} />
      ) : null}

      {versionUploadDoc ? (
        <NewVersionModal
          doc={versionUploadDoc}
          meta={meta.data}
          onClose={() => setVersionUploadDoc(null)}
          onSaved={reloadAll}
        />
      ) : null}

      {editDoc ? (
        <EditDocumentModal
          doc={editDoc}
          meta={meta.data}
          onClose={() => setEditDoc(null)}
          onSaved={reloadAll}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteDoc)}
        title="Delete document"
        message={
          <p>
            This permanently removes <strong>{deleteDoc?.name}</strong> and the file stored behind it. Version history of
            this document is deleted as well.
          </p>
        }
        confirmLabel="Delete document"
        tone="danger"
        loading={deleteBusy}
        onCancel={() => setDeleteDoc(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </div>
  );
}
