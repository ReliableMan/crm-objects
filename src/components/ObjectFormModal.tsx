import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useCreateObject, useUpdateObject, type ObjectInput } from '../api/objects';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Передан — редактирование, нет — создание */
  object?: ObjectInput & { id: string };
}

const required = (v: string) => (v.trim().length > 0 ? null : 'Обязательное поле');

export function ObjectFormModal({ opened, onClose, object }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={object ? 'Изменить объект' : 'Новый объект'}>
      {/* key: при каждом открытии форма заполняется заново */}
      {opened && <ObjectForm key={object?.id ?? 'new'} object={object} onDone={onClose} />}
    </Modal>
  );
}

function ObjectForm({ object, onDone }: { object?: Props['object']; onDone: () => void }) {
  const create = useCreateObject();
  const update = useUpdateObject();
  const form = useForm<ObjectInput>({
    initialValues: { name: object?.name ?? '', address: object?.address ?? '' },
    validate: { name: required, address: required },
  });

  const submit = form.onSubmit((values) => {
    const input = { name: values.name.trim(), address: values.address.trim() };
    if (object) update.mutate({ id: object.id, ...input }, { onSuccess: onDone });
    else create.mutate(input, { onSuccess: onDone });
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        <TextInput label="Название" withAsterisk data-autofocus {...form.getInputProps('name')} />
        <TextInput label="Адрес" withAsterisk {...form.getInputProps('address')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Отмена
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
