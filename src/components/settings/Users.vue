<template>
    <div>
        <div class="add-btn">
            <button class="btn btn-primary me-2" type="button" @click="showAdd">
                <font-awesome-icon icon="plus" />
                {{ $t("Add User") }}
            </button>
        </div>

        <div>
            <span
                v-if="users.length === 0"
                class="d-flex align-items-center justify-content-center my-3"
            >
                {{ $t("No users") }}
            </span>

            <div v-for="u in users" :key="u.id" class="item" :class="u.active ? 'active' : 'inactive'">
                <div class="left-part">
                    <div class="circle"></div>
                    <div class="info">
                        <div class="title">{{ u.username }}</div>
                        <div class="status">
                            {{ $t(roleLabelKey(u.role)) }}
                            <span v-if="!u.active"> — {{ $t("Inactive") }}</span>
                            <span v-if="u.username === $root.username"> ({{ $t("you") }})</span>
                        </div>
                    </div>
                </div>

                <div class="buttons">
                    <div class="btn-group" role="group">
                        <button class="btn btn-normal" @click="showEdit(u)">
                            <font-awesome-icon icon="edit" />
                            {{ $t("Edit") }}
                        </button>
                        <button class="btn btn-normal" @click="showResetPassword(u)">
                            <font-awesome-icon icon="key" />
                            {{ $t("Reset Password") }}
                        </button>
                        <button
                            class="btn btn-danger"
                            :disabled="u.username === $root.username"
                            @click="showDelete(u)"
                        >
                            <font-awesome-icon icon="trash" />
                            {{ $t("Delete") }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add/Edit modal -->
        <div ref="userModalEl" class="modal fade" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <form @submit.prevent="submitUser">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                {{ editing ? $t("Edit User") : $t("Add User") }}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">{{ $t("Username") }}</label>
                                <input v-model="form.username" type="text" class="form-control" required />
                            </div>
                            <div v-if="!editing" class="mb-3">
                                <label class="form-label">{{ $t("Password") }}</label>
                                <input v-model="form.password" type="password" class="form-control" required autocomplete="new-password" />
                            </div>
                            <div class="mb-3">
                                <label class="form-label">{{ $t("Role") }}</label>
                                <select v-model="form.role" class="form-select">
                                    <option value="admin">{{ $t("Admin") }}</option>
                                    <option value="editor">{{ $t("Editor") }}</option>
                                    <option value="viewer">{{ $t("Viewer") }}</option>
                                </select>
                            </div>
                            <div v-if="editing" class="form-check">
                                <input :id="'userActive' + (form.id || 0)" v-model="form.active" type="checkbox" class="form-check-input" />
                                <label :for="'userActive' + (form.id || 0)" class="form-check-label">
                                    {{ $t("Active") }}
                                </label>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                {{ $t("Cancel") }}
                            </button>
                            <button type="submit" class="btn btn-primary" :disabled="processing">
                                {{ $t("Save") }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Reset password modal -->
        <div ref="resetPasswordModalEl" class="modal fade" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <form @submit.prevent="submitResetPassword">
                        <div class="modal-header">
                            <h5 class="modal-title">{{ $t("Reset Password") }}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>{{ $t("resetPasswordFor", { username: resetTarget?.username }) }}</p>
                            <div class="mb-3">
                                <label class="form-label">{{ $t("New Password") }}</label>
                                <input v-model="resetPasswordValue" type="password" class="form-control" required autocomplete="new-password" />
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                {{ $t("Cancel") }}
                            </button>
                            <button type="submit" class="btn btn-primary" :disabled="processing">
                                {{ $t("Save") }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <Confirm ref="confirmDelete" btn-style="btn-danger" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="deleteUser">
            {{ $t("confirmDeleteUserMsg", { username: deleteTarget?.username }) }}
        </Confirm>
    </div>
</template>

<script>
import { Modal } from "bootstrap";
import Confirm from "../Confirm.vue";

export default {
    components: {
        Confirm,
    },
    data() {
        return {
            users: [],
            processing: false,
            editing: false,
            form: {
                id: null,
                username: "",
                password: "",
                role: "viewer",
                active: true,
            },
            resetTarget: null,
            resetPasswordValue: "",
            deleteTarget: null,
            userModal: null,
            resetPasswordModal: null,
        };
    },
    mounted() {
        this.userModal = new Modal(this.$refs.userModalEl);
        this.resetPasswordModal = new Modal(this.$refs.resetPasswordModalEl);
        this.load();
    },
    methods: {
        roleLabelKey(role) {
            if (role === "admin") {
                return "Admin";
            }
            if (role === "editor") {
                return "Editor";
            }
            return "Viewer";
        },
        load() {
            this.$root.getSocket().emit("getUserList", (res) => {
                if (res.ok) {
                    this.users = res.users;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },
        showAdd() {
            this.editing = false;
            this.form = { id: null, username: "", password: "", role: "viewer", active: true };
            this.userModal.show();
        },
        showEdit(u) {
            this.editing = true;
            this.form = { id: u.id, username: u.username, password: "", role: u.role, active: !!u.active };
            this.userModal.show();
        },
        showResetPassword(u) {
            this.resetTarget = u;
            this.resetPasswordValue = "";
            this.resetPasswordModal.show();
        },
        showDelete(u) {
            this.deleteTarget = u;
            this.$refs.confirmDelete.show();
        },
        submitUser() {
            this.processing = true;
            const done = (res) => {
                this.processing = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.userModal.hide();
                    this.load();
                }
            };
            if (this.editing) {
                this.$root.getSocket().emit(
                    "editUser",
                    this.form.id,
                    { username: this.form.username, role: this.form.role, active: this.form.active },
                    done
                );
            } else {
                this.$root.getSocket().emit(
                    "addUser",
                    { username: this.form.username, password: this.form.password, role: this.form.role },
                    done
                );
            }
        },
        submitResetPassword() {
            this.processing = true;
            this.$root.getSocket().emit("resetUserPassword", this.resetTarget.id, this.resetPasswordValue, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.resetPasswordModal.hide();
                }
            });
        },
        deleteUser() {
            this.$root.getSocket().emit("deleteUser", this.deleteTarget.id, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.load();
                }
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../../assets/vars.scss";

.add-btn {
    padding-top: 20px;
    padding-bottom: 20px;
}

.item {
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 10px;
    transition: all ease-in-out 0.15s;
    justify-content: space-between;
    padding: 10px;
    min-height: 70px;
    margin-bottom: 5px;

    &:hover {
        background-color: $highlight-white;
    }

    &.active .circle {
        background-color: $primary;
    }

    &.inactive .circle {
        background-color: $danger;
    }

    .left-part {
        display: flex;
        gap: 12px;
        align-items: center;

        .circle {
            width: 25px;
            height: 25px;
            border-radius: 50rem;
        }

        .info {
            .title {
                font-weight: bold;
                font-size: 20px;
            }

            .status {
                font-size: 14px;
            }
        }
    }
}

.dark {
    .item:hover {
        background-color: $dark-bg2;
    }
}
</style>
