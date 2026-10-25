import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Btn, Card, Empty, Field, H, Notice, Row, Screen, T } from '../components/ui';
import { C } from '../constants/theme';
import { useAsync } from '../hooks/useAsync';
import { MAX_CONTACTS, addContact, getContacts, removeContact } from '../services/contacts';
import { award } from '../services/safePoints';
import { dialEmergencyNumber } from '../services/sos';

export default function Contacts() {
  const { data, reload } = useAsync(getContacts, []);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rel, setRel] = useState('');
  const [err, setErr] = useState('');

  const add = async () => {
    try {
      await addContact(name, phone, rel);
      setName(''); setPhone(''); setRel(''); setErr('');
      void award('contact_added');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <Screen>
      <H>Who should we alert?</H>
      <T dim small>SOS texts everyone here. Add people who can reach you quickly. Stored encrypted on this phone.</T>
      {data.length === 0 ? <Empty title="No contacts yet" body="Add at least one person below." /> : data.map((c) => (
        <Card key={c.id}>
          <Row>
            <T bold style={{ flex: 1 }}>{c.name}</T>
            <T dim small>{c.relationship ?? ''}</T>
          </Row>
          <T dim>{c.phone}</T>
          <Row>
            <Btn small outline label="Call" onPress={() => void dialEmergencyNumber(c.phone)} />
            <Btn small outline color={C.crimson} label="Remove" onPress={() => Alert.alert('Remove contact?', c.name, [{ text: 'Keep' }, { text: 'Remove', style: 'destructive', onPress: () => void removeContact(c.id).then(reload) }])} />
          </Row>
        </Card>
      ))}
      <Card>
        <T bold>Add contact ({data.length}/{MAX_CONTACTS})</T>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Phone (e.g. 082 123 4567)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Relationship (optional)" value={rel} onChangeText={setRel} />
        {err ? <Notice kind="error">{err}</Notice> : null}
        <Btn label="Save contact" onPress={() => void add()} />
      </Card>
    </Screen>
  );
}
