import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Feather from '@react-native-vector-icons/feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, ThemeColors } from '../../../context/ThemeContext';
import { useAppTranslation } from '../../../hooks/useAppTranslation';
import { businessService } from '../../../services';
import { PartyKind } from '../../../finance/models/Business';
import { InputField } from '../../../components/InputField';
import { Button } from '../../../components/Button';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../../theme/typography';

const AddEditPartyScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const partyId: string | undefined = route?.params?.partyId;
  const kind: PartyKind = route?.params?.kind ?? 'CUSTOMER';
  const isEdit = !!partyId;
  const isCustomer = kind === 'CUSTOMER';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (!partyId) return;
    businessService.getParty(partyId).then(p => {
      if (!p) return;
      setName(p.name);
      setPhone(p.phone ?? '');
      setAddress(p.address ?? '');
      setNotes(p.notes ?? '');
    });
  }, [partyId]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = t('common.required');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const input = {
      kind,
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit && partyId) {
        await businessService.updateParty(partyId, input);
      } else {
        await businessService.createParty(input);
      }
      navigation?.goBack();
    } catch {
      Alert.alert(t('common.error'), t('business.saveFailed'));
      setSaving(false);
    }
  };

  const title = isEdit
    ? isCustomer ? t('business.editCustomer') : t('business.editSupplier')
    : isCustomer ? t('business.addCustomer') : t('business.addSupplier');

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <InputField label={t('business.name')} required value={name} onChangeText={setName} error={errors.name} autoCapitalize="words" />
        <InputField label={t('business.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <InputField label={t('business.address')} value={address} onChangeText={setAddress} multiline />
        <InputField label={t('business.notes')} value={notes} onChangeText={setNotes} multiline />
      </ScrollView>

      {/* Sticky footer — actions stay above the floating tab bar */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.borderLight,
            paddingBottom: insets.bottom + FLOATING_TAB_BAR_CLEARANCE,
          },
        ]}
      >
        <View style={styles.actions}>
          <Button title={t('common.cancel')} onPress={() => navigation?.goBack()} variant="outline" style={{ flex: 1 }} />
          <Button title={t('common.save')} onPress={handleSave} loading={saving} style={{ flex: 2 }} />
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '800' },
    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
    footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
    actions: { flexDirection: 'row', gap: 12 },
  });

export default AddEditPartyScreen;
