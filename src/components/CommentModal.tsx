import { useState } from 'react';
import { Button, Group, Modal, Stack, Textarea } from '@mantine/core';

interface Props {
  opened: boolean;
  title: string;
  submitLabel: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
}

/** Обязательный комментарий к переходу (например, «Вернуть на доработку»). */
export function CommentModal({ opened, title, submitLabel, loading, onClose, onSubmit }: Props) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setComment('');
    setError(null);
    onClose();
  };

  const submit = () => {
    const value = comment.trim();
    if (value.length === 0) {
      setError('Комментарий обязателен');
      return;
    }
    onSubmit(value);
  };

  return (
    <Modal opened={opened} onClose={close} title={title}>
      <Stack>
        <Textarea
          label="Комментарий"
          placeholder="Что нужно исправить"
          autosize
          minRows={3}
          withAsterisk
          data-autofocus
          value={comment}
          error={error}
          onChange={(e) => {
            setComment(e.currentTarget.value);
            setError(null);
          }}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={close} disabled={loading}>
            Отмена
          </Button>
          <Button onClick={submit} loading={loading}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
